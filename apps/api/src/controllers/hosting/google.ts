import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import crypto from 'crypto'
import { resolveUserId } from './authHelper'
import { setAgentIntegration, removeAgentIntegration, getAgentIntegration, getAllIntegrations, getPrimaryAgent, type AgentType } from '@/services/agentIntegrations'

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

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://api.clawflow.flowmatic.co.il/hosting/integrations/google/callback'
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://clawflow.flowmatic.co.il'

// Available Google scopes (limited to what google-lite-mcp.js supports)
const SCOPE_MAP: Record<string, string> = {
    calendar: 'https://www.googleapis.com/auth/calendar',
    gmail: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    contacts: 'https://www.googleapis.com/auth/contacts',
}

// ── GET /integrations/google/auth ──
// Starts OAuth flow — redirects user to Google consent screen
export const googleAuth = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        const scopeParam = c.req.query('scopes') || 'calendar'

        if (!instanceId) return fail(c, 'instanceId required', 400)
        if (!GOOGLE_CLIENT_ID) return fail(c, 'Google OAuth not configured', 500)

        // Verify ownership (token from query param — OAuth redirect has no Authorization header)
        const userId = resolveUserId(c) || resolveUserIdFromQuery(c)
        if (!userId) return fail(c, 'Authentication required', 401)
        const [inst] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!inst) return fail(c, 'Instance not found', 404)

        // Build scopes from comma-separated list
        const requestedScopes = scopeParam.split(',').map(s => SCOPE_MAP[s.trim()]).filter(Boolean)
        if (requestedScopes.length === 0) return fail(c, 'No valid scopes', 400)

        // Always include openid + email for identification
        const scopes = [
            'openid',
            'https://www.googleapis.com/auth/userinfo.email',
            ...requestedScopes,
        ]

        // Determine agent type from query param (default: primary agent for this instance)
        const agentParam = c.req.query('agent') as AgentType | undefined
        const agentType: AgentType = agentParam && ['oc', 'mt', 'bare'].includes(agentParam)
            ? agentParam
            : getPrimaryAgent((inst.selectedComponents as string[]) || [])

        // State = instanceId + scopes + agent + HMAC signature (prevents tampering)
        const statePayload = JSON.stringify({ instanceId, scopes: scopeParam, uid: userId, agent: agentType })
        const stateHmac = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(statePayload).digest('base64url')
        const state = Buffer.from(JSON.stringify({ p: statePayload, s: stateHmac })).toString('base64url')

        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: GOOGLE_REDIRECT_URI,
            response_type: 'code',
            scope: scopes.join(' '),
            access_type: 'offline',         // get refresh_token
            prompt: 'consent',              // always show consent (ensures refresh_token)
            state,
        })

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
        return c.redirect(authUrl)
    } catch (err) {
        console.error('googleAuth error:', err)
        return fail(c, 'Failed to start Google auth', 500)
    }
}

// ── GET /integrations/google/callback ──
// Google redirects here after user approves
export const googleCallback = async (c: Context) => {
    try {
        const code = c.req.query('code')
        const stateParam = c.req.query('state')
        const error = c.req.query('error')

        if (error) {
            console.error('Google OAuth error:', error)
            return c.redirect(`${FRONTEND_URL}/dashboard?google_error=${error}`)
        }

        if (!code || !stateParam) {
            return c.redirect(`${FRONTEND_URL}/dashboard?google_error=missing_params`)
        }

        // Decode and verify state (HMAC-signed to prevent tampering)
        const stateOuter = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
        const expectedHmac = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(stateOuter.p).digest('base64url')
        if (stateOuter.s !== expectedHmac) {
            console.error('Google OAuth state HMAC mismatch — possible tampering')
            return c.redirect(`${FRONTEND_URL}/dashboard.html?google_error=invalid_state`)
        }

        // Route to GSC callback if state indicates GSC auth
        try {
            const statePayload = JSON.parse(stateOuter.p)
            if (statePayload.type === 'gsc') {
                const { gscCallbackHandler } = await import('./gsc')
                return gscCallbackHandler(c, code!, stateOuter)
            }
        } catch { /* not GSC — continue with normal Google flow */ }
        const stateData = JSON.parse(stateOuter.p)
        const { instanceId, scopes } = stateData
        // Extract agent type from state (defaults to primary agent for backward compat)
        const agentType: AgentType = stateData.agent || 'oc'

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
            scope?: string
            error?: string
            error_description?: string
        }

        if (tokenData.error || !tokenData.access_token) {
            console.error('Google token exchange failed:', tokenData.error_description || tokenData.error)
            return c.redirect(`${FRONTEND_URL}/dashboard?google_error=token_failed`)
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

        // Save tokens to DB
        const googleTokens = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
            expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
            scopes: scopes.split(','),
            email,
            connectedAt: new Date().toISOString(),
        }

        // Write to per-agent integrations (single source of truth)
        await setAgentIntegration(instanceId, agentType, 'google', googleTokens as any)

        // Legacy dual-write (keep until all reads migrated)
        await db.update(instances)
            .set({ googleTokens: googleTokens as any })
            .where(eq(instances.id, instanceId))

        console.log(`Google connected for instance ${instanceId}, agent ${agentType}: ${email} (scopes: ${scopes})`)

        // Deploy credentials to VPS so agent can use Google APIs
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (instance?.ip) {
            try {
                await deployGoogleToVPS(instance.ip, instance.rootPassword || undefined, {
                    clientId: GOOGLE_CLIENT_ID,
                    clientSecret: GOOGLE_CLIENT_SECRET,
                    accessToken: tokenData.access_token!,
                    refreshToken: tokenData.refresh_token || '',
                }, scopes, agentType)
                // Update SOUL.md to include calendar tool instructions
                await updateSoulWithTools(instance.ip, instance.rootPassword || undefined)
            } catch (deployErr) {
                console.error('Failed to deploy Google creds to VPS:', deployErr)
            }
        }

        // Redirect back to dashboard with success
        return c.redirect(`${FRONTEND_URL}/dashboard?google_connected=true&scopes=${scopes}`)
    } catch (err) {
        console.error('googleCallback error:', err)
        return c.redirect(`${FRONTEND_URL}/dashboard?google_error=server_error`)
    }
}

// ── POST /integrations/google/disconnect ──
export const googleDisconnect = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || c.req.param('instanceId')
        if (!instanceId) return fail(c, 'instanceId required', 400)

        // Verify ownership
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Authentication required', 401)
        const [instance] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!instance) return fail(c, 'Instance not found', 404)

        // Determine which agent to disconnect
        const agentParam = c.req.query('agent') as AgentType | undefined
        const agentType: AgentType = agentParam && ['oc', 'mt', 'bare'].includes(agentParam)
            ? agentParam
            : getPrimaryAgent((instance.selectedComponents as string[]) || [])

        // Get tokens from agent_integrations (primary source)
        const agentInt = await getAgentIntegration(instanceId, agentType, 'google')
        const tokens = agentInt?.config as any
        if (tokens?.accessToken) {
            try {
                await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.accessToken}`, {
                    method: 'POST',
                })
            } catch { /* best effort */ }
        }

        // Remove from per-agent integrations
        await removeAgentIntegration(instanceId, agentType, 'google')

        // Legacy cleanup: only null out if no other agent has Google connected
        const remaining = await getAllIntegrations(instanceId)
        const anyGoogleLeft = remaining.some(r => r.integrationType === 'google' && r.status === 'connected')
        if (!anyGoogleLeft) {
            await db.update(instances)
                .set({ googleTokens: null })
                .where(eq(instances.id, instanceId))
        }

        // Remove MCP server: stop → edit → start (per-agent name)
        const mcpServerName = `google-workspace-${agentType}`
        if (instance.ip) {
            try {
                await sshExec(instance.ip, `
                    systemctl stop openclaw-gateway &&
                    python3 -c "
import json
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.get('mcp', {}).get('servers', {}).pop('${mcpServerName}', None)
# Also remove legacy non-suffixed name
d.get('mcp', {}).get('servers', {}).pop('google-workspace', None)
with open(p, 'w') as f: json.dump(d, f, indent=2)
" &&
                    chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
                    systemctl start openclaw-gateway
                `, instance.rootPassword || undefined)
            } catch { /* best effort */ }
        }

        return ok(c, null, 'Google disconnected.')
    } catch (err) {
        console.error('googleDisconnect error:', err)
        return fail(c, 'Failed to disconnect', 500)
    }
}

// ── GET /integrations/google/status ──
export const googleStatus = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        if (!instanceId) return fail(c, 'instanceId required', 400)

        // Verify ownership
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Authentication required', 401)
        const [instance] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!instance) return fail(c, 'Instance not found', 404)

        // Read from agent_integrations (per-agent)
        const agentParam = c.req.query('agent') as AgentType | undefined
        const agentType: AgentType = agentParam && ['oc', 'mt', 'bare'].includes(agentParam)
            ? agentParam
            : getPrimaryAgent((instance.selectedComponents as string[]) || [])

        const agentInt = await getAgentIntegration(instanceId, agentType, 'google')
        if (!agentInt || !agentInt.config?.accessToken) {
            return ok(c, { connected: false, agent: agentType }, 'Not connected.')
        }

        const tokens = agentInt.config as any
        return ok(c, {
            connected: true,
            agent: agentType,
            email: tokens.email || '',
            scopes: tokens.scopes || [],
            connectedAt: tokens.connectedAt || '',
        }, 'Connected.')
    } catch (err) {
        console.error('googleStatus error:', err)
        return fail(c, 'Failed to get status', 500)
    }
}

// ── Deploy lightweight Google MCP server to VPS ──
// Uses google-lite-mcp.js (10 tools) instead of @presto-ai/google-workspace-mcp (25-30 tools)
// Per-agent: MCP server name includes agent suffix (google-workspace-oc, google-workspace-mt)
async function deployGoogleToVPS(ip: string, password: string | undefined, creds: {
    clientId: string
    clientSecret: string
    accessToken: string
    refreshToken: string
}, scopes?: string, agentType: AgentType = 'oc'): Promise<void> {
    const mcpServerName = `google-workspace-${agentType}`
    console.log(`Deploying google-lite MCP server '${mcpServerName}' to ${ip} (scopes: ${scopes || 'calendar,gmail,contacts'})...`)

    // Deploy our lite MCP script to the VPS
    const { resolve } = await import('path')
    const mcpScript = readFileSync(resolve(process.cwd(), '../../scripts/google-lite-mcp.js'), 'utf-8')
    const scriptB64 = Buffer.from(mcpScript).toString('base64')

    const mcpConfig = {
        command: 'node',
        args: ['/opt/openclaw/google-lite-mcp.js'],
        env: {
            GOOGLE_CLIENT_ID: creds.clientId,
            GOOGLE_CLIENT_SECRET: creds.clientSecret,
            GOOGLE_REFRESH_TOKEN: creds.refreshToken,
            GOOGLE_SCOPES: scopes || 'calendar,gmail,contacts',
        },
    }

    const mcpB64 = Buffer.from(JSON.stringify(mcpConfig)).toString('base64')

    // CRITICAL: stop gateway FIRST, then edit config, then start.
    await sshExec(ip, `
        echo '${scriptB64}' | base64 -d > /opt/openclaw/google-lite-mcp.js &&
        chmod 644 /opt/openclaw/google-lite-mcp.js &&
        systemctl stop openclaw-gateway &&
        python3 -c "
import json, base64, sys
cfg = json.loads(base64.b64decode(sys.argv[1]))
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.setdefault('mcp', {}).setdefault('servers', {})
# Remove legacy non-suffixed server (from before agent isolation)
d['mcp']['servers'].pop('google-workspace', None)
d['mcp']['servers']['${mcpServerName}'] = cfg
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('${mcpServerName} configured: ' + cfg['command'])
" '${mcpB64}' &&
        chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
        systemctl start openclaw-gateway
    `, password)

    console.log(`google-lite MCP server '${mcpServerName}' deployed to ${ip}`)
}

// ── Update SOUL.md with available tools after integration ──
async function updateSoulWithTools(ip: string, password?: string): Promise<void> {
    try {
        // Check if SOUL.md already has MCP tools section
        const soul = await sshExec(ip, 'cat /home/openclaw/.openclaw/workspace/SOUL.md', password)
        if (soul.includes('Google Workspace MCP')) {
            console.log('SOUL.md already has Google MCP tools section')
            return
        }

        const toolsSection = `

## Google Workspace MCP
שרת Google Workspace MCP מותקן ומחובר. כלים זמינים:
- **Calendar** — יצירה, עדכון, מחיקת אירועים ביומן
- **Gmail** — קריאה ושליחת מיילים
- **Drive** — גישה לקבצים ב-Google Drive
- **Sheets** — קריאה ועריכת גיליונות
הכלים זמינים דרך MCP — השתמש בהם ישירות, הם מוגדרים אוטומטית.
`
        const b64 = Buffer.from(toolsSection).toString('base64')
        await sshExec(ip,
            `echo '${b64}' | base64 -d >> /home/openclaw/.openclaw/workspace/SOUL.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/SOUL.md`,
            password
        )

        await sshExec(ip, 'systemctl restart openclaw-gateway', password)
        console.log('SOUL.md updated with Google MCP tools section')
    } catch (err) {
        console.error('updateSoulWithTools error:', err)
    }
}
