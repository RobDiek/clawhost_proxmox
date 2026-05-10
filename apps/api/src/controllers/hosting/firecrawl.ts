/**
 * Firecrawl Integration
 *
 * API key-based: user provides Firecrawl API key.
 * Deploys the Firecrawl MCP server to the client VPS for full-site crawling,
 * competitor content extraction, broken link detection, and technical SEO audit.
 *
 * Free tier: 500 pages/month.
 */

import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { setAgentIntegration, removeAgentIntegration, getPrimaryAgent } from '@/services/agentIntegrations'
import { resolveActiveAgent, writeAgentTokens } from '@/services/agentContext'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, timeoutMs)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(output.trim()) })
            })
        }).on('error', (err) => { clearTimeout(timer); reject(err) })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH key or password')) }
        conn.connect(opts)
    })
}

// ── POST /integrations/firecrawl/save ──
export const saveFirecrawlKey = async (c: Context) => {
    try {
        const body = await c.req.json<{ instanceId: string; key: string }>()
        const { instanceId, key } = body

        if (!instanceId || !key) {
            return fail(c, 'instanceId and key required', 400)
        }

        // Basic validation: Firecrawl keys start with fc-
        if (!key.startsWith('fc-')) {
            return fail(c, 'Invalid Firecrawl API key format (should start with fc-)', 400)
        }

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        // Validate key by making a test crawl
        try {
            const testRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: 'https://example.com', formats: ['markdown'], onlyMainContent: true }),
            })
            if (testRes.status === 401 || testRes.status === 403) {
                return fail(c, 'Invalid Firecrawl API key', 401)
            }
        } catch {
            // Network error — save anyway, might be temporary
        }

        // Store key — Phase 2.3.E: per-agent
        const __activeAgent = await resolveActiveAgent(c, instanceId)
        await writeAgentTokens(c, instanceId, { firecrawlKey: key })

        // Write to per-agent integrations
        const agentType = getPrimaryAgent((instance.selectedComponents as string[]) || [])
        await setAgentIntegration(instanceId, agentType, 'firecrawl',
            { connected: true, connectedAt: new Date().toISOString() },
            'connected', __activeAgent?.id,
        ).catch(err => console.error('Failed to set agent firecrawl integration:', err))

        // Deploy MCP to VPS
        if (instance.ip) {
            try {
                await deployFirecrawlMcpToVPS(instance.ip, instance.rootPassword || undefined, key)
                await updateSoulWithFirecrawlTools(instance.ip, instance.rootPassword || undefined)
            } catch (deployErr) {
                console.error('Failed to deploy Firecrawl MCP to VPS:', deployErr)
            }
        }

        return ok(c, { masked: key.slice(0, 6) + '****' }, 'Firecrawl connected.')
    } catch (err) {
        console.error('saveFirecrawlKey error:', err)
        return fail(c, 'Failed to save Firecrawl key', 500)
    }
}

// ── GET /integrations/firecrawl/status ──
export const getFirecrawlStatus = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        if (!instanceId) return fail(c, 'instanceId required', 400)

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        // Phase 2.3.E — per-agent firecrawl key
        const { resolveActiveAgent } = await import('@/services/agentContext')
        const __activeAgent = await resolveActiveAgent(c, instanceId)
        const key = __activeAgent?.firecrawlKey || instance.firecrawlKey
        if (!key) {
            return ok(c, { connected: false }, 'Not connected.')
        }

        return ok(c, {
            connected: true,
            masked: key.slice(0, 6) + '****',
        }, 'Connected.')
    } catch (err) {
        console.error('getFirecrawlStatus error:', err)
        return fail(c, 'Failed to get status', 500)
    }
}

// ── POST /integrations/firecrawl/disconnect ──
export const removeFirecrawlKey = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || (await c.req.json<{ instanceId: string }>().catch(() => ({} as any))).instanceId
        if (!instanceId) return fail(c, 'instanceId required', 400)

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        // Phase 2.3.E — clear per-agent
        const __activeAgent = await resolveActiveAgent(c, instanceId)
        await writeAgentTokens(c, instanceId, { firecrawlKey: null })

        // Remove from per-agent integrations (only this agent)
        const agentType = getPrimaryAgent((instance.selectedComponents as string[]) || [])
        await removeAgentIntegration(instanceId, agentType, 'firecrawl', __activeAgent?.id).catch(() => {})

        // Remove MCP server from VPS
        if (instance.ip) {
            try {
                await sshExec(instance.ip, `
                    systemctl stop openclaw-gateway &&
                    python3 -c "
import json
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.get('mcp', {}).get('servers', {}).pop('firecrawl', None)
with open(p, 'w') as f: json.dump(d, f, indent=2)
" &&
                    chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
                    systemctl start openclaw-gateway
                `, instance.rootPassword || undefined)
            } catch { /* best effort */ }
        }

        return ok(c, null, 'Firecrawl disconnected.')
    } catch (err) {
        console.error('removeFirecrawlKey error:', err)
        return fail(c, 'Failed to disconnect', 500)
    }
}

// ── Deploy Firecrawl MCP server to VPS ──
async function deployFirecrawlMcpToVPS(ip: string, password: string | undefined, apiKey: string): Promise<void> {
    console.log(`Deploying Firecrawl MCP server to ${ip}...`)

    const mcpConfig = {
        command: 'npx',
        args: ['-y', 'firecrawl-mcp'],
        env: {
            FIRECRAWL_API_KEY: apiKey,
        },
    }

    const mcpB64 = Buffer.from(JSON.stringify(mcpConfig)).toString('base64')

    await sshExec(ip, `
        systemctl stop openclaw-gateway &&
        python3 -c "
import json, base64, sys
cfg = json.loads(base64.b64decode(sys.argv[1]))
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.setdefault('mcp', {}).setdefault('servers', {})
d['mcp']['servers']['firecrawl'] = cfg
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('firecrawl configured')
" '${mcpB64}' &&
        chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
        systemctl start openclaw-gateway
    `, password)

    console.log(`Firecrawl MCP server deployed to ${ip}`)
}

// ── Update SOUL.md with Firecrawl tools section ──
async function updateSoulWithFirecrawlTools(ip: string, password?: string): Promise<void> {
    try {
        const soul = await sshExec(ip, 'cat /home/openclaw/.openclaw/workspace/SOUL.md', password)
        if (soul.includes('Firecrawl MCP')) return

        const toolsSection = `

## Firecrawl MCP
שרת Firecrawl MCP מותקן ומחובר. כלים זמינים:
- **scrape** — סריקת דף בודד, חילוץ תוכן כ-Markdown
- **crawl** — סריקת אתר שלם (כל הדפים), מיפוי מבנה
- **map** — מפת אתר — כל ה-URLs שנמצאו
- **search** — חיפוש תוכן בתוך אתר
שימושים: ניתוח מתחרים, בדיקת קישורים שבורים, חילוץ מבנה תוכן. מגבלה: 500 דפים/חודש בחינם.
`
        const b64 = Buffer.from(toolsSection).toString('base64')
        await sshExec(ip,
            `echo '${b64}' | base64 -d >> /home/openclaw/.openclaw/workspace/SOUL.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/SOUL.md`,
            password
        )
        await sshExec(ip, 'systemctl restart openclaw-gateway', password)
        console.log('SOUL.md updated with Firecrawl MCP tools section')
    } catch (err) {
        console.error('updateSoulWithFirecrawlTools error:', err)
    }
}