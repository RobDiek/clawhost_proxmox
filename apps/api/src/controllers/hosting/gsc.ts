/**
 * Google Search Console Integration
 *
 * Uses the existing Google OAuth flow (google.ts) with an additional
 * `webmasters.readonly` scope. Once connected, deploys a lightweight
 * GSC MCP server to the client VPS so the agent can pull positions,
 * impressions, CTR, and index-coverage data autonomously.
 */

import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import crypto from 'crypto'
import { resolveUserId } from './authHelper'
import { setAgentIntegration, removeAgentIntegration, getPrimaryAgent } from '@/services/agentIntegrations'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
// Reuse the same Google OAuth redirect URI — differentiate by state.type='gsc'
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://api.clawflow.flowmatic.co.il/hosting/integrations/google/callback'
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://clawflow.flowmatic.co.il'

const GSC_SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/webmasters.readonly',
]

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

/** Parse JWT from ?token= query param (for OAuth redirects) */
function resolveUserIdFromQuery(c: Context): string | null {
    const queryToken = c.req.query('token')
    if (!queryToken) return null
    const parts = queryToken.split('.')
    if (parts.length !== 3) return null
    const secret = process.env.JWT_SECRET || ''
    const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url')
    if (parts[2] !== expected) return null
    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
        return payload.sub || null
    } catch { return null }
}

// ── GET /integrations/gsc/auth ──
// Starts GSC-specific OAuth flow
export const gscAuth = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        const siteUrl = c.req.query('siteUrl') || ''

        if (!instanceId) return fail(c, 'instanceId required', 400)
        if (!GOOGLE_CLIENT_ID) return fail(c, 'Google OAuth not configured', 500)

        const userId = resolveUserId(c) || resolveUserIdFromQuery(c)
        if (!userId) return fail(c, 'Authentication required', 401)
        const [inst] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!inst) return fail(c, 'Instance not found', 404)

        // State = instanceId + siteUrl + HMAC signature
        const statePayload = JSON.stringify({ instanceId, siteUrl, uid: userId, type: 'gsc' })
        const stateHmac = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(statePayload).digest('base64url')
        const state = Buffer.from(JSON.stringify({ p: statePayload, s: stateHmac })).toString('base64url')

        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: GOOGLE_REDIRECT_URI,
            response_type: 'code',
            scope: GSC_SCOPES.join(' '),
            access_type: 'offline',
            prompt: 'consent',
            state,
        })

        return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
    } catch (err) {
        console.error('gscAuth error:', err)
        return fail(c, 'Failed to start GSC auth', 500)
    }
}

// ── Core GSC token exchange + save logic ──
// Used by both gscCallback (direct) and gscCallbackHandler (routed from google.ts)
async function processGscCallback(c: Context, code: string, instanceId: string, siteUrl: string): Promise<Response> {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code',
        }),
    })

    const tokenData = await tokenRes.json() as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
        error?: string
        error_description?: string
    }

    if (tokenData.error || !tokenData.access_token) {
        console.error('GSC token exchange failed:', tokenData.error_description || tokenData.error)
        return c.redirect(`${FRONTEND_URL}/dashboard?gsc_error=token_failed`)
    }

    // Get user email
    let email = ''
    try {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        const userData = await userRes.json() as { email?: string }
        email = userData.email || ''
    } catch { /* non-critical */ }

    // Fetch available sites from GSC
    let sites: string[] = []
    try {
        const sitesRes = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        const sitesData = await sitesRes.json() as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> }
        sites = (sitesData.siteEntry || []).map(s => s.siteUrl)
    } catch (err) {
        console.error('Failed to fetch GSC sites:', err)
    }

    // Save GSC tokens to DB
    const gscTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || '',
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
        email,
        siteUrl: siteUrl || sites[0] || '',
        sites,
        connectedAt: new Date().toISOString(),
    }

    await db.update(instances)
        .set({ gscTokens: gscTokens as any })
        .where(eq(instances.id, instanceId))

    // Write to per-agent integrations
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    const agentType = getPrimaryAgent((inst?.selectedComponents as string[]) || [])
    await setAgentIntegration(instanceId, agentType, 'gsc', gscTokens as any)
        .catch(err => console.error('Failed to set agent GSC integration:', err))

    console.log(`GSC connected for instance ${instanceId}: ${email} (sites: ${sites.length})`)

    // Deploy GSC MCP to VPS
    if (inst?.ip) {
        try {
            await deployGscMcpToVPS(inst.ip, inst.rootPassword || undefined, {
                clientId: GOOGLE_CLIENT_ID,
                clientSecret: GOOGLE_CLIENT_SECRET,
                refreshToken: tokenData.refresh_token || '',
                siteUrl: gscTokens.siteUrl,
            })
            await updateSoulWithGscTools(inst.ip, inst.rootPassword || undefined)
        } catch (deployErr) {
            console.error('Failed to deploy GSC MCP to VPS:', deployErr)
        }
    }

    return c.redirect(`${FRONTEND_URL}/dashboard?gsc_connected=true&sites=${sites.length}`)
}

// ── Called from google.ts callback when state.type === 'gsc' ──
export const gscCallbackHandler = async (c: Context, code: string, stateOuter: { p: string; s: string }) => {
    try {
        const { instanceId, siteUrl } = JSON.parse(stateOuter.p)
        return processGscCallback(c, code, instanceId, siteUrl || '')
    } catch (err) {
        console.error('gscCallbackHandler error:', err)
        return c.redirect(`${FRONTEND_URL}/dashboard?gsc_error=server_error`)
    }
}

// ── GET /integrations/gsc/callback (direct — fallback) ──
export const gscCallback = async (c: Context) => {
    try {
        const code = c.req.query('code')
        const stateParam = c.req.query('state')
        const error = c.req.query('error')

        if (error) return c.redirect(`${FRONTEND_URL}/dashboard?gsc_error=${error}`)
        if (!code || !stateParam) return c.redirect(`${FRONTEND_URL}/dashboard?gsc_error=missing_params`)

        const stateOuter = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
        const expectedHmac = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(stateOuter.p).digest('base64url')
        if (stateOuter.s !== expectedHmac) return c.redirect(`${FRONTEND_URL}/dashboard?gsc_error=invalid_state`)

        const { instanceId, siteUrl } = JSON.parse(stateOuter.p)
        return processGscCallback(c, code, instanceId, siteUrl || '')
    } catch (err) {
        console.error('gscCallback error:', err)
        return c.redirect(`${FRONTEND_URL}/dashboard?gsc_error=server_error`)
    }
}

// ── POST /integrations/gsc/disconnect ──
export const gscDisconnect = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || c.req.param('instanceId')
        if (!instanceId) return fail(c, 'instanceId required', 400)

        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Authentication required', 401)
        const [instance] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!instance) return fail(c, 'Instance not found', 404)

        // Revoke token
        const tokens = instance.gscTokens as any
        if (tokens?.accessToken) {
            try {
                await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.accessToken}`, { method: 'POST' })
            } catch { /* best effort */ }
        }

        // Clear from DB
        await db.update(instances)
            .set({ gscTokens: null })
            .where(eq(instances.id, instanceId))

        // Remove from per-agent integrations
        const components = (instance.selectedComponents as string[]) || []
        for (const at of ['oc', 'mt', 'bare'] as const) {
            if (components.includes(at)) {
                await removeAgentIntegration(instanceId, at, 'gsc').catch(() => {})
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
d.get('mcp', {}).get('servers', {}).pop('gsc', None)
with open(p, 'w') as f: json.dump(d, f, indent=2)
" &&
                    chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
                    systemctl start openclaw-gateway
                `, instance.rootPassword || undefined)
            } catch { /* best effort */ }
        }

        return ok(c, null, 'Google Search Console disconnected.')
    } catch (err) {
        console.error('gscDisconnect error:', err)
        return fail(c, 'Failed to disconnect', 500)
    }
}

// ── GET /integrations/gsc/status ──
export const gscStatus = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        if (!instanceId) return fail(c, 'instanceId required', 400)

        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Authentication required', 401)
        const [instance] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!instance) return fail(c, 'Instance not found', 404)

        const tokens = instance.gscTokens as any
        if (!tokens?.accessToken) {
            return ok(c, { connected: false }, 'Not connected.')
        }

        return ok(c, {
            connected: true,
            email: tokens.email || '',
            siteUrl: tokens.siteUrl || '',
            sites: tokens.sites || [],
            connectedAt: tokens.connectedAt || '',
        }, 'Connected.')
    } catch (err) {
        console.error('gscStatus error:', err)
        return fail(c, 'Failed to get status', 500)
    }
}

// ── POST /integrations/gsc/set-site ──
// Switch the active GSC property
export const gscSetSite = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || c.req.param('instanceId')
        if (!instanceId) return fail(c, 'instanceId required', 400)

        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Authentication required', 401)
        const [instance] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!instance) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ siteUrl: string }>()
        if (!body.siteUrl) return fail(c, 'siteUrl required', 400)

        const tokens = instance.gscTokens as any
        if (!tokens?.accessToken) return fail(c, 'GSC not connected', 400)

        // Validate site is in the authorized list
        if (!tokens.sites?.includes(body.siteUrl)) {
            return fail(c, 'Site not authorized in GSC', 400)
        }

        tokens.siteUrl = body.siteUrl
        await db.update(instances)
            .set({ gscTokens: tokens })
            .where(eq(instances.id, instanceId))

        // Update MCP env on VPS
        if (instance.ip) {
            try {
                await deployGscMcpToVPS(instance.ip, instance.rootPassword || undefined, {
                    clientId: GOOGLE_CLIENT_ID,
                    clientSecret: GOOGLE_CLIENT_SECRET,
                    refreshToken: tokens.refreshToken,
                    siteUrl: body.siteUrl,
                })
            } catch { /* best effort */ }
        }

        return ok(c, { siteUrl: body.siteUrl }, 'GSC site updated.')
    } catch (err) {
        console.error('gscSetSite error:', err)
        return fail(c, 'Failed to update site', 500)
    }
}

// ── Deploy GSC MCP server to VPS ──
async function deployGscMcpToVPS(ip: string, password: string | undefined, creds: {
    clientId: string
    clientSecret: string
    refreshToken: string
    siteUrl: string
}): Promise<void> {
    console.log(`Deploying GSC MCP server to ${ip} (site: ${creds.siteUrl})...`)

    const mcpConfig = {
        command: 'npx',
        args: ['-y', '@anthropic/gsc-mcp-server'],
        env: {
            GOOGLE_CLIENT_ID: creds.clientId,
            GOOGLE_CLIENT_SECRET: creds.clientSecret,
            GOOGLE_REFRESH_TOKEN: creds.refreshToken,
            GSC_SITE_URL: creds.siteUrl,
        },
    }

    const mcpB64 = Buffer.from(JSON.stringify(mcpConfig)).toString('base64')

    // stop → edit → start pattern
    await sshExec(ip, `
        systemctl stop openclaw-gateway &&
        python3 -c "
import json, base64, sys
cfg = json.loads(base64.b64decode(sys.argv[1]))
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.setdefault('mcp', {}).setdefault('servers', {})
d['mcp']['servers']['gsc'] = cfg
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('gsc configured')
" '${mcpB64}' &&
        chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
        systemctl start openclaw-gateway
    `, password)

    console.log(`GSC MCP server deployed to ${ip}`)
}

// ── Update SOUL.md with GSC tools section ──
async function updateSoulWithGscTools(ip: string, password?: string): Promise<void> {
    try {
        const soul = await sshExec(ip, 'cat /home/openclaw/.openclaw/workspace/SOUL.md', password)
        if (soul.includes('Google Search Console MCP')) return

        const toolsSection = `

## Google Search Console MCP
שרת GSC MCP מותקן ומחובר. כלים זמינים:
- **searchAnalytics** — שליפת נתוני positions, impressions, clicks, CTR לפי query/page/date
- **sitemaps** — רשימת sitemaps ומצב אינדוקס
- **urlInspection** — בדיקת סטטוס אינדוקס של URL ספציפי
הכלים זמינים דרך MCP — השתמש בהם ישירות.
`
        const b64 = Buffer.from(toolsSection).toString('base64')
        await sshExec(ip,
            `echo '${b64}' | base64 -d >> /home/openclaw/.openclaw/workspace/SOUL.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/SOUL.md`,
            password
        )
        await sshExec(ip, 'systemctl restart openclaw-gateway', password)
        console.log('SOUL.md updated with GSC MCP tools section')
    } catch (err) {
        console.error('updateSoulWithGscTools error:', err)
    }
}