import type { Context } from 'hono'
import { readFileSync } from 'fs'
import path from 'path'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import crypto from 'crypto'
import { resolveUserId } from './authHelper'
import { setAgentIntegration, removeAgentIntegration, getAgentIntegration, getAllIntegrations, getPrimaryAgent, type AgentType } from '@/services/agentIntegrations'
import { writeAgentTokens } from '@/services/agentContext'

/** Parse JWT from ?token= query param (for OAuth redirects that can't send Authorization header) */
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

const MS_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || ''
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || ''
const MS_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'https://api.clawflow.flowmatic.co.il/hosting/integrations/microsoft/callback'
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://clawflow.flowmatic.co.il'
const MS_TENANT = 'common' // supports personal + work accounts

// Available Microsoft Graph scopes
const SCOPE_MAP: Record<string, string> = {
    mail: 'Mail.Read Mail.Send',
    calendar: 'Calendars.ReadWrite',
    contacts: 'Contacts.ReadWrite',
}

// ── GET /integrations/microsoft/auth ──
export const microsoftAuth = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        const scopeParam = c.req.query('scopes') || 'calendar,mail,contacts'

        if (!instanceId) return fail(c, 'instanceId required', 400)
        if (!MS_CLIENT_ID) return fail(c, 'Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.', 500)

        // Verify ownership (token from query param — OAuth redirect has no Authorization header)
        const userId = resolveUserId(c) || resolveUserIdFromQuery(c)
        if (!userId) return fail(c, 'Authentication required', 401)
        const [inst] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!inst) return fail(c, 'Instance not found', 404)

        const requestedScopes = scopeParam.split(',').map(s => SCOPE_MAP[s.trim()]).filter(Boolean)
        if (requestedScopes.length === 0) return fail(c, 'No valid scopes', 400)

        const scopes = [
            'openid',
            'profile',
            'email',
            'offline_access', // for refresh_token
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
            client_id: MS_CLIENT_ID,
            redirect_uri: MS_REDIRECT_URI,
            response_type: 'code',
            scope: scopes.join(' '),
            response_mode: 'query',
            prompt: 'consent',
            state,
        })

        const authUrl = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize?${params.toString()}`
        return c.redirect(authUrl)
    } catch (err) {
        console.error('microsoftAuth error:', err)
        return fail(c, 'Failed to start Microsoft auth', 500)
    }
}

// ── GET /integrations/microsoft/callback ──
export const microsoftCallback = async (c: Context) => {
    try {
        const code = c.req.query('code')
        const stateParam = c.req.query('state')
        const error = c.req.query('error')
        const errorDesc = c.req.query('error_description')

        if (error) {
            console.error('Microsoft OAuth error:', error, errorDesc)
            return c.redirect(`${FRONTEND_URL}/dashboard.html?ms_error=${error}`)
        }

        if (!code || !stateParam) {
            return c.redirect(`${FRONTEND_URL}/dashboard.html?ms_error=missing_params`)
        }

        // Decode and verify state (HMAC-signed to prevent tampering)
        const stateOuter = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
        const expectedHmac = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(stateOuter.p).digest('base64url')
        if (stateOuter.s !== expectedHmac) {
            console.error('Microsoft OAuth state HMAC mismatch — possible tampering')
            return c.redirect(`${FRONTEND_URL}/dashboard.html?ms_error=invalid_state`)
        }
        const stateData = JSON.parse(stateOuter.p)
        const { instanceId, scopes } = stateData
        // Extract agent type from state (defaults to primary agent for backward compat)
        const agentType: AgentType = stateData.agent || 'oc'

        // Exchange code for tokens
        const tokenRes = await fetch(`https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: MS_CLIENT_ID,
                client_secret: MS_CLIENT_SECRET,
                code,
                redirect_uri: MS_REDIRECT_URI,
                grant_type: 'authorization_code',
                scope: scopes.split(',').map((s: string) => SCOPE_MAP[s.trim()]).filter(Boolean).join(' ') + ' offline_access openid email profile',
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
            console.error('Microsoft token exchange failed:', tokenData.error_description || tokenData.error)
            return c.redirect(`${FRONTEND_URL}/dashboard.html?ms_error=token_failed`)
        }

        // Get user profile
        let email = ''
        let displayName = ''
        try {
            const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
            })
            const profile = await profileRes.json() as { mail?: string; userPrincipalName?: string; displayName?: string }
            email = profile.mail || profile.userPrincipalName || ''
            displayName = profile.displayName || ''
        } catch { /* non-critical */ }

        // Save tokens to DB
        const microsoftTokens = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
            expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
            scopes: scopes.split(','),
            email,
            displayName,
            connectedAt: new Date().toISOString(),
        }

        // Write to per-agent integrations (single source of truth)
        await setAgentIntegration(instanceId, agentType, 'microsoft', microsoftTokens as any)

        // Phase 2.3.B — write to active mateh_agent (with primary mirror)
        await writeAgentTokens(c, instanceId, { microsoftTokens: microsoftTokens as never })

        console.log(`Microsoft 365 connected for instance ${instanceId}, agent ${agentType}: ${email} (scopes: ${scopes})`)

        // Deploy credentials to VPS
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (instance?.ip) {
            try {
                await deployMicrosoftToVPS(instance.ip, instance.rootPassword || undefined, {
                    accessToken: tokenData.access_token!,
                    refreshToken: tokenData.refresh_token || '',
                    clientId: MS_CLIENT_ID,
                    clientSecret: MS_CLIENT_SECRET,
                    email,
                }, scopes, agentType)
            } catch (err) {
                console.error('Failed to deploy Microsoft creds to VPS:', err)
            }
        }

        return c.redirect(`${FRONTEND_URL}/dashboard.html?ms_connected=true&scopes=${scopes}`)
    } catch (err) {
        console.error('microsoftCallback error:', err)
        return c.redirect(`${FRONTEND_URL}/dashboard.html?ms_error=server_error`)
    }
}

// ── POST /integrations/microsoft/disconnect ──
export const microsoftDisconnect = async (c: Context) => {
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

        // Remove from per-agent integrations
        await removeAgentIntegration(instanceId, agentType, 'microsoft')

        // Phase 2.3.B — clear on active mateh_agent
        await writeAgentTokens(c, instanceId, { microsoftTokens: null })
        const remaining = await getAllIntegrations(instanceId)
        const anyMicrosoftLeft = remaining.some(r => r.integrationType === 'microsoft' && r.status === 'connected')
        if (!anyMicrosoftLeft) {
            await db.update(instances)
                .set({ microsoftTokens: null })
                .where(eq(instances.id, instanceId))
        }

        // Remove MCP server: stop → edit → start (per-agent name)
        const mcpServerName = `ms-365-${agentType}`
        if (instance?.ip) {
            try {
                await sshExec(instance.ip, `
                    systemctl stop openclaw-gateway &&
                    python3 -c "
import json
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.get('mcp', {}).get('servers', {}).pop('${mcpServerName}', None)
# Also remove legacy non-suffixed name
d.get('mcp', {}).get('servers', {}).pop('ms-365', None)
with open(p, 'w') as f: json.dump(d, f, indent=2)
" &&
                    chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
                    systemctl start openclaw-gateway
                `, instance.rootPassword || undefined)
            } catch { /* best effort */ }
        }

        return ok(c, null, 'Microsoft 365 disconnected.')
    } catch (err) {
        console.error('microsoftDisconnect error:', err)
        return fail(c, 'Failed to disconnect', 500)
    }
}

// ── GET /integrations/microsoft/status ──
export const microsoftStatus = async (c: Context) => {
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

        // Phase 2.3.E — honor ?agentId= for per-agent isolation
        const { resolveActiveAgent } = await import('@/services/agentContext')
        const __activeAgent = await resolveActiveAgent(c, instanceId)
        const agentInt = await getAgentIntegration(instanceId, agentType, 'microsoft', __activeAgent?.id)
        if (!agentInt || !agentInt.config?.accessToken) {
            return ok(c, { connected: false, agent: agentType }, 'Not connected.')
        }

        const tokens = agentInt.config as any
        return ok(c, {
            connected: true,
            agent: agentType,
            email: tokens.email || '',
            displayName: tokens.displayName || '',
            scopes: tokens.scopes || [],
            connectedAt: tokens.connectedAt || '',
        }, 'Connected.')
    } catch (err) {
        console.error('microsoftStatus error:', err)
        return fail(c, 'Failed to get status', 500)
    }
}

// ── Deploy lightweight Microsoft 365 MCP server to VPS ──
// Uses our ms365-lite-mcp.js (8 tools) instead of @softeria/ms-365-mcp-server (120+ tools)
// Per-agent: MCP server name includes agent suffix (ms-365-oc, ms-365-mt)
async function deployMicrosoftToVPS(ip: string, password: string | undefined, creds: {
    accessToken: string
    refreshToken: string
    clientId: string
    clientSecret: string
    email: string
}, scopes?: string, agentType: AgentType = 'oc'): Promise<void> {
    const mcpServerName = `ms-365-${agentType}`
    console.log(`Deploying ms365-lite MCP server '${mcpServerName}' to ${ip} (scopes: ${scopes || 'calendar,mail'})...`)

    // First, deploy our lite MCP script to the VPS
    const mcpScript = readFileSync(
        path.resolve(process.cwd(), '../../scripts/ms365-lite-mcp.js'),
        'utf-8'
    )
    const scriptB64 = Buffer.from(mcpScript).toString('base64')

    // MCP config uses our lite server instead of the heavy npm package
    const mcpConfig = {
        command: 'node',
        args: ['/opt/openclaw/ms365-lite-mcp.js'],
        env: {
            MS_CLIENT_ID: creds.clientId,
            MS_CLIENT_SECRET: creds.clientSecret,
            MS_REFRESH_TOKEN: creds.refreshToken,
            MS_TENANT_ID: MS_TENANT,
            MS365_SCOPES: scopes || 'calendar,mail,contacts',
        },
    }

    const mcpB64 = Buffer.from(JSON.stringify(mcpConfig)).toString('base64')

    // CRITICAL: stop gateway FIRST, then edit config, then start.
    // Gateway overwrites openclaw.json from internal state on hot-reload.
    // Only when stopped does it accept file changes.
    await sshExec(ip, `
        echo '${scriptB64}' | base64 -d > /opt/openclaw/ms365-lite-mcp.js &&
        chmod 644 /opt/openclaw/ms365-lite-mcp.js &&
        systemctl stop openclaw-gateway &&
        python3 -c "
import json, base64, sys
cfg = json.loads(base64.b64decode(sys.argv[1]))
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.setdefault('mcp', {}).setdefault('servers', {})
# Remove legacy non-suffixed server (from before agent isolation)
d['mcp']['servers'].pop('ms-365', None)
d['mcp']['servers']['${mcpServerName}'] = cfg
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('${mcpServerName} configured: ' + cfg['command'])
" '${mcpB64}' &&
        chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
        systemctl start openclaw-gateway
    `, password)

    console.log(`ms365-lite MCP server '${mcpServerName}' deployed to ${ip}`)
}