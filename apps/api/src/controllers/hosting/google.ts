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

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://api.openclaw.flowmatic.co.il/hosting/integrations/google/callback'
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://openclaw.flowmatic.co.il'

// Available Google scopes
const SCOPE_MAP: Record<string, string> = {
    calendar: 'https://www.googleapis.com/auth/calendar',
    drive: 'https://www.googleapis.com/auth/drive.readonly',
    gmail: 'https://www.googleapis.com/auth/gmail.send',
    sheets: 'https://www.googleapis.com/auth/spreadsheets',
}

// ── GET /integrations/google/auth ──
// Starts OAuth flow — redirects user to Google consent screen
export const googleAuth = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        const scopeParam = c.req.query('scopes') || 'calendar'

        if (!instanceId) return fail(c, 'instanceId required', 400)
        if (!GOOGLE_CLIENT_ID) return fail(c, 'Google OAuth not configured', 500)

        // Build scopes from comma-separated list
        const requestedScopes = scopeParam.split(',').map(s => SCOPE_MAP[s.trim()]).filter(Boolean)
        if (requestedScopes.length === 0) return fail(c, 'No valid scopes', 400)

        // Always include openid + email for identification
        const scopes = [
            'openid',
            'https://www.googleapis.com/auth/userinfo.email',
            ...requestedScopes,
        ]

        // State = instanceId + requested scopes (for callback)
        const state = Buffer.from(JSON.stringify({ instanceId, scopes: scopeParam })).toString('base64url')

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

        // Decode state
        const { instanceId, scopes } = JSON.parse(Buffer.from(stateParam, 'base64url').toString())

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

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
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

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
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
    console.log(`Deploying Google credentials to ${ip}...`)

    // Install gcalcli + google-auth if not present
    await sshExec(ip, `which gcalcli || (apt-get install -y -qq python3-pip 2>/dev/null; pip3 install --break-system-packages gcalcli google-auth google-auth-oauthlib 2>/dev/null) || true`, password)

    // Write OAuth credentials as pickle (gcalcli format) using Python
    await sshExec(ip, `python3 << 'PYEOF'
import pickle, os
from google.oauth2.credentials import Credentials

creds = Credentials(
    token="${creds.accessToken}",
    refresh_token="${creds.refreshToken}",
    token_uri="https://oauth2.googleapis.com/token",
    client_id="${creds.clientId}",
    client_secret="${creds.clientSecret}",
    scopes=["https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/spreadsheets"]
)

# gcalcli pickle path
path = os.path.expanduser("~openclaw/.local/share/gcalcli/oauth")
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "wb") as f:
    pickle.dump(creds, f)

# Also save as google-credentials.json for agents
creds_dir = os.path.expanduser("~openclaw/.openclaw/credentials")
os.makedirs(creds_dir, exist_ok=True)
import json
with open(f"{creds_dir}/google.json", "w") as f:
    json.dump({
        "type": "authorized_user",
        "client_id": "${creds.clientId}",
        "client_secret": "${creds.clientSecret}",
        "refresh_token": "${creds.refreshToken}"
    }, f, indent=2)

# Fix ownership
for p in [path, f"{creds_dir}/google.json"]:
    os.system(f"chown openclaw:openclaw {p}")

print("OK")
PYEOF`, password)

    // Restart gateway to pick up new credentials + skills
    await sshExec(ip, 'systemctl restart openclaw-gateway', password)

    console.log(`Google credentials deployed to ${ip}`)
}

// ── Update SOUL.md with available tools after integration ──
async function updateSoulWithTools(ip: string, password?: string): Promise<void> {
    try {
        // Check if SOUL.md already has tools section
        const soul = await sshExec(ip, 'cat /home/openclaw/.openclaw/workspace/SOUL.md', password)
        if (soul.includes('כלים זמינים') && soul.includes('gcalcli')) {
            console.log('SOUL.md already has tools section')
            return
        }

        const toolsSection = `

## כלים זמינים
כלים שמותקנים במערכת ואפשר להשתמש בהם דרך bash:
- **gcalcli** — Google Calendar: יצירה, צפייה, מחיקת אירועים
  - יצירה: gcalcli add --title "שם" --when "YYYY-MM-DD HH:MM" --duration דקות
  - צפייה: gcalcli agenda
  - מחיקה: gcalcli delete "שם"
- **web search** — חיפוש באינטרנט (מובנה)
- **browser** — גלישה באתרים (מובנה)

## כשמבקשים פעולה ביומן
1. השתמש ב-gcalcli
2. אשר למשתמש שהפעולה בוצעה
3. אם gcalcli לא זמין — הודע שצריך לחבר Google Calendar בלוח הבקרה
`
        // Append tools section via base64 to avoid shell issues
        const b64 = Buffer.from(toolsSection).toString('base64')
        await sshExec(ip,
            `echo ${b64} | base64 -d >> /home/openclaw/.openclaw/workspace/SOUL.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/SOUL.md`,
            password
        )

        // Restart gateway to pick up updated SOUL.md
        await sshExec(ip, 'systemctl restart openclaw-gateway', password)
        console.log('SOUL.md updated with tools section')
    } catch (err) {
        console.error('updateSoulWithTools error:', err)
    }
}
