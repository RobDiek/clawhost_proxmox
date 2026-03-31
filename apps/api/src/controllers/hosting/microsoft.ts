import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { conn.end(); resolve(output.trim()) })
            })
        }).on('error', reject)
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root' }
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
    mail: 'Mail.ReadWrite Mail.Send',
    calendar: 'Calendars.ReadWrite',
    contacts: 'Contacts.Read',
    files: 'Files.ReadWrite',
    teams: 'Chat.ReadWrite',
    tasks: 'Tasks.ReadWrite',
}

// ── GET /integrations/microsoft/auth ──
export const microsoftAuth = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        const scopeParam = c.req.query('scopes') || 'mail,calendar'

        if (!instanceId) return fail(c, 'instanceId required', 400)
        if (!MS_CLIENT_ID) return fail(c, 'Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.', 500)

        const requestedScopes = scopeParam.split(',').map(s => SCOPE_MAP[s.trim()]).filter(Boolean)
        if (requestedScopes.length === 0) return fail(c, 'No valid scopes', 400)

        const scopes = [
            'openid',
            'profile',
            'email',
            'offline_access', // for refresh_token
            ...requestedScopes,
        ]

        const state = Buffer.from(JSON.stringify({ instanceId, scopes: scopeParam })).toString('base64url')

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

        const { instanceId, scopes } = JSON.parse(Buffer.from(stateParam, 'base64url').toString())

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

        await db.update(instances)
            .set({ microsoftTokens: microsoftTokens as any })
            .where(eq(instances.id, instanceId))

        console.log(`Microsoft 365 connected for instance ${instanceId}: ${email} (scopes: ${scopes})`)

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
                })
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

        await db.update(instances)
            .set({ microsoftTokens: null })
            .where(eq(instances.id, instanceId))

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

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance) return fail(c, 'Instance not found', 404)

        const tokens = instance.microsoftTokens as any
        if (!tokens?.accessToken) {
            return ok(c, { connected: false }, 'Not connected.')
        }

        return ok(c, {
            connected: true,
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

// ── Deploy Microsoft credentials to VPS ──
async function deployMicrosoftToVPS(ip: string, password: string | undefined, creds: {
    accessToken: string
    refreshToken: string
    clientId: string
    clientSecret: string
    email: string
}): Promise<void> {
    console.log(`Deploying Microsoft 365 credentials to ${ip}...`)

    const credsJson = JSON.stringify({
        type: 'microsoft_oauth',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        access_token: creds.accessToken,
        refresh_token: creds.refreshToken,
        email: creds.email,
        graph_endpoint: 'https://graph.microsoft.com/v1.0',
    })

    const b64 = Buffer.from(credsJson).toString('base64')
    await sshExec(ip, `
        mkdir -p /home/openclaw/.openclaw/credentials &&
        echo '${b64}' | base64 -d > /home/openclaw/.openclaw/credentials/microsoft.json &&
        chown openclaw:openclaw /home/openclaw/.openclaw/credentials/microsoft.json
    `, password)

    // Update SOUL.md with Microsoft tools
    const toolsSection = `
## Microsoft 365
כלים זמינים דרך Microsoft Graph API:
- **Outlook Mail** — שליחה וקריאת אימיילים
- **Calendar** — ניהול אירועים, פגישות, תזכורות
- **OneDrive** — גישה לקבצים

הגישה דרך credentials/microsoft.json — access_token + refresh_token.
קריאות API: https://graph.microsoft.com/v1.0/me/messages, /me/events, /me/drive
`
    const soul = await sshExec(ip, 'cat /home/openclaw/.openclaw/workspace/SOUL.md', password)
    if (!soul.includes('Microsoft 365')) {
        const b64Soul = Buffer.from(toolsSection).toString('base64')
        await sshExec(ip,
            `echo ${b64Soul} | base64 -d >> /home/openclaw/.openclaw/workspace/SOUL.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/SOUL.md`,
            password
        )
    }

    await sshExec(ip, 'systemctl restart openclaw-gateway', password)
    console.log(`Microsoft 365 credentials deployed to ${ip}`)
}
