/**
 * DataForSEO Integration
 *
 * API key-based: user provides login + password from DataForSEO dashboard.
 * Deploys the DataForSEO MCP server to the client VPS for SERP tracking,
 * keyword research, backlink analysis, and AI visibility monitoring.
 *
 * Cost: ~$0.002-0.01 per query ≈ $5-15/month for typical MATEH usage.
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

// ── POST /integrations/dataforseo/save ──
export const saveDataforseoKey = async (c: Context) => {
    try {
        const body = await c.req.json<{ instanceId: string; login: string; password: string }>()
        const { instanceId, login, password: apiPassword } = body

        if (!instanceId || !login || !apiPassword) {
            return fail(c, 'instanceId, login, and password required', 400)
        }

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        // Validate credentials by making a test API call
        const testRes = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${login}:${apiPassword}`).toString('base64'),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify([{ keyword: 'test', location_code: 2376, language_code: 'he', depth: 1 }]),
        })
        const testData = await testRes.json() as { status_code?: number; status_message?: string }
        if (testData.status_code && testData.status_code !== 20000 && testData.status_code !== 40501) {
            // 40501 = insufficient credits, but credentials are valid
            if (testData.status_code === 40100) {
                return fail(c, 'Invalid DataForSEO credentials', 401)
            }
        }

        // Store credentials (login:password format)
        const credentialString = `${login}:${apiPassword}`
        await db.update(instances)
            .set({ dataforseoKey: credentialString })
            .where(eq(instances.id, instanceId))

        // Write to per-agent integrations
        const agentType = getPrimaryAgent((instance.selectedComponents as string[]) || [])
        await setAgentIntegration(instanceId, agentType, 'dataforseo', { login, connected: true, connectedAt: new Date().toISOString() })
            .catch(err => console.error('Failed to set agent dataforseo integration:', err))

        // Deploy MCP to VPS
        if (instance.ip) {
            try {
                await deployDataforseoMcpToVPS(instance.ip, instance.rootPassword || undefined, login, apiPassword)
                await updateSoulWithDataforseoTools(instance.ip, instance.rootPassword || undefined)
            } catch (deployErr) {
                console.error('Failed to deploy DataForSEO MCP to VPS:', deployErr)
            }
        }

        return ok(c, { login }, 'DataForSEO connected.')
    } catch (err) {
        console.error('saveDataforseoKey error:', err)
        return fail(c, 'Failed to save DataForSEO key', 500)
    }
}

// ── GET /integrations/dataforseo/status ──
export const getDataforseoStatus = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        if (!instanceId) return fail(c, 'instanceId required', 400)

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        if (!instance.dataforseoKey) {
            return ok(c, { connected: false }, 'Not connected.')
        }

        const login = instance.dataforseoKey.split(':')[0] || ''
        return ok(c, { connected: true, login }, 'Connected.')
    } catch (err) {
        console.error('getDataforseoStatus error:', err)
        return fail(c, 'Failed to get status', 500)
    }
}

// ── POST /integrations/dataforseo/disconnect ──
export const removeDataforseoKey = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || (await c.req.json<{ instanceId: string }>().catch(() => ({} as any))).instanceId
        if (!instanceId) return fail(c, 'instanceId required', 400)

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        await db.update(instances)
            .set({ dataforseoKey: null })
            .where(eq(instances.id, instanceId))

        // Remove from per-agent integrations
        const components = (instance.selectedComponents as string[]) || []
        for (const at of ['oc', 'mt', 'bare'] as const) {
            if (components.includes(at)) {
                await removeAgentIntegration(instanceId, at, 'dataforseo').catch(() => {})
            }
        }

        // Remove MCP server from VPS
        if (instance.ip) {
            try {
                await sshExec(instance.ip, `
                    systemctl stop openclaw-gateway &&
                    python3 -c "
import json
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.get('mcp', {}).get('servers', {}).pop('dataforseo', None)
with open(p, 'w') as f: json.dump(d, f, indent=2)
" &&
                    chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
                    systemctl start openclaw-gateway
                `, instance.rootPassword || undefined)
            } catch { /* best effort */ }
        }

        return ok(c, null, 'DataForSEO disconnected.')
    } catch (err) {
        console.error('removeDataforseoKey error:', err)
        return fail(c, 'Failed to disconnect', 500)
    }
}

// ── Deploy DataForSEO MCP server to VPS ──
async function deployDataforseoMcpToVPS(ip: string, password: string | undefined, login: string, apiPassword: string): Promise<void> {
    console.log(`Deploying DataForSEO MCP server to ${ip}...`)

    const mcpConfig = {
        command: 'npx',
        args: ['-y', 'dataforseo-mcp-server'],
        env: {
            DATAFORSEO_USERNAME: login,
            DATAFORSEO_PASSWORD: apiPassword,
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
d['mcp']['servers']['dataforseo'] = cfg
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('dataforseo configured')
" '${mcpB64}' &&
        chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
        systemctl start openclaw-gateway
    `, password)

    console.log(`DataForSEO MCP server deployed to ${ip}`)
}

// ── Update SOUL.md with DataForSEO tools section ──
async function updateSoulWithDataforseoTools(ip: string, password?: string): Promise<void> {
    try {
        const soul = await sshExec(ip, 'cat /home/openclaw/.openclaw/workspace/SOUL.md', password)
        if (soul.includes('DataForSEO MCP')) return

        const toolsSection = `

## DataForSEO MCP
שרת DataForSEO MCP מותקן ומחובר. כלים זמינים:
- **SERP Analysis** — תוצאות חיפוש Google לכל query, כולל AI Overviews
- **Keyword Research** — נפח חיפוש, קושי, CPC, מילות מפתח קשורות
- **Backlinks** — ניתוח בקלינקים של כל דומיין
- **AI Visibility** — בדיקת ציטוטים ב-ChatGPT, Perplexity, Claude, Gemini
- **PageSpeed** — ביצועי Core Web Vitals
- **Competitors** — ניתוח מתחרים SEO (shared keywords, traffic estimates)
עלות: ~$0.002-0.01 לשאילתה. השתמש בחוכמה — בדוק רק מה שצריך.
`
        const b64 = Buffer.from(toolsSection).toString('base64')
        await sshExec(ip,
            `echo '${b64}' | base64 -d >> /home/openclaw/.openclaw/workspace/SOUL.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/SOUL.md`,
            password
        )
        await sshExec(ip, 'systemctl restart openclaw-gateway', password)
        console.log('SOUL.md updated with DataForSEO MCP tools section')
    } catch (err) {
        console.error('updateSoulWithDataforseoTools error:', err)
    }
}