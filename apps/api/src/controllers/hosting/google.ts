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

// Available Google scopes
const SCOPE_MAP: Record<string, string> = {
    calendar: 'https://www.googleapis.com/auth/calendar',
    drive: 'https://www.googleapis.com/auth/drive.readonly',
    gmail: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    sheets: 'https://www.googleapis.com/auth/spreadsheets',
    youtube: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube',
    ads: 'https://www.googleapis.com/auth/adwords',
    gbp: 'https://www.googleapis.com/auth/business.manage',
}

// ── GET /integrations/google/auth ──
// Starts OAuth flow — redirects user to Google consent screen
export const googleAuth = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        const scopeParam = c.req.query('scopes') || 'calendar'

        if (!instanceId) return fail(c, 'instanceId required', 400)
        if (!GOOGLE_CLIENT_ID) return fail(c, 'Google OAuth not configured', 500)

        // Verify ownership
        const userId = resolveUserId(c)
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

        // State = instanceId + scopes + HMAC signature (prevents tampering)
        const statePayload = JSON.stringify({ instanceId, scopes: scopeParam, uid: userId })
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
        const { instanceId, scopes } = JSON.parse(stateOuter.p)

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

        await db.update(instances)
            .set({ googleTokens: googleTokens as any })
            .where(eq(instances.id, instanceId))

        // Write to per-agent integrations
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const agentType = getPrimaryAgent((inst?.selectedComponents as string[]) || [])
        await setAgentIntegration(instanceId, agentType, 'google', googleTokens as any)
            .catch(err => console.error('Failed to set agent google integration:', err))

        console.log(`Google connected for instance ${instanceId}: ${email} (scopes: ${scopes})`)

        // Deploy credentials to VPS so agent can use Google APIs
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (instance?.ip) {
            try {
                await deployGoogleToVPS(instance.ip, instance.rootPassword || undefined, {
                    clientId: GOOGLE_CLIENT_ID,
                    clientSecret: GOOGLE_CLIENT_SECRET,
                    accessToken: tokenData.access_token!,
                    refreshToken: tokenData.refresh_token || '',
                })
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

        // Revoke token at Google
        const tokens = instance.googleTokens as any
        if (tokens?.accessToken) {
            try {
                await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.accessToken}`, {
                    method: 'POST',
                })
            } catch { /* best effort */ }
        }

        // Clear from DB
        await db.update(instances)
            .set({ googleTokens: null })
            .where(eq(instances.id, instanceId))

        // Remove from per-agent integrations (all agents)
        const components = (instance.selectedComponents as string[]) || []
        for (const at of ['oc', 'mt', 'bare'] as const) {
            if (components.includes(at)) {
                await removeAgentIntegration(instanceId, at, 'google').catch(() => {})
            }
        }

        // Remove MCP server from VPS (combined into single SSH call)
        if (instance.ip) {
            try {
                await sshExec(instance.ip,
                    `rm -f /home/openclaw/.openclaw/mcp-servers/google-workspace.json && systemctl restart openclaw-gateway`,
                    instance.rootPassword || undefined)
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

        const tokens = instance.googleTokens as any
        if (!tokens?.accessToken) {
            return ok(c, { connected: false }, 'Not connected.')
        }

        return ok(c, {
            connected: true,
            email: tokens.email || '',
            scopes: tokens.scopes || [],
            connectedAt: tokens.connectedAt || '',
        }, 'Connected.')
    } catch (err) {
        console.error('googleStatus error:', err)
        return fail(c, 'Failed to get status', 500)
    }
}

// ── Deploy Google credentials to client VPS ──
async function deployGoogleToVPS(ip: string, password: string | undefined, creds: {
    clientId: string
    clientSecret: string
    accessToken: string
    refreshToken: string
}): Promise<void> {
    console.log(`Deploying Google MCP server to ${ip}...`)

    // Configure Google Workspace MCP server via openclaw CLI
    const mcpConfig = JSON.stringify({
        command: 'npx',
        args: ['-y', '@presto-ai/google-workspace-mcp'],
        env: {
            GOOGLE_CLIENT_ID: creds.clientId,
            GOOGLE_CLIENT_SECRET: creds.clientSecret,
            GOOGLE_REFRESH_TOKEN: creds.refreshToken,
        },
    })

    // Also keep legacy credential file for backward compatibility
    const credJson = JSON.stringify({
        type: 'authorized_user',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
    })

    // Combined into single SSH call: MCP set + legacy creds + restart
    const b64 = Buffer.from(mcpConfig).toString('base64')
    const b64Cred = Buffer.from(credJson).toString('base64')
    await sshExec(ip, `
        echo '${b64}' | base64 -d > /tmp/mcp-cfg.json &&
        mkdir -p /home/openclaw/.openclaw/mcp-servers &&
        cp /tmp/mcp-cfg.json /home/openclaw/.openclaw/mcp-servers/google-workspace.json &&
        chown -R openclaw:openclaw /home/openclaw/.openclaw/mcp-servers &&
        rm -f /tmp/mcp-cfg.json &&
        mkdir -p /home/openclaw/.openclaw/credentials &&
        echo '${b64Cred}' | base64 -d > /home/openclaw/.openclaw/credentials/google.json &&
        chown -R openclaw:openclaw /home/openclaw/.openclaw/credentials &&
        systemctl restart openclaw-gateway
    `, password)

    console.log(`Google MCP server deployed to ${ip}`)
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
