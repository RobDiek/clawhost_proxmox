import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'

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
