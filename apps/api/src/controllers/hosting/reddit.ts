/**
 * Reddit Integration (Script App — PRAW-style)
 *
 * Flow:
 * 1. User creates Reddit app at https://www.reddit.com/prefs/apps (type: script)
 * 2. User provides: clientId, clientSecret, username, password
 * 3. POST /integrations/reddit/save → validates via password grant, stores
 * 4. Agents can post/comment/read via stored credentials
 *
 * Stored in agent_integrations table as 'reddit' integration per primary agent.
 * No DB schema migration needed — uses existing jsonb config field.
 *
 * License note: PRAW is BSD-2-Clause (Python) — we don't ship it.
 * Reddit API is free for personal/non-commercial + 100 QPM throttle.
 */

import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { setAgentIntegration, removeAgentIntegration, getAgentIntegration, getPrimaryAgent } from '@/services/agentIntegrations'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq } from 'drizzle-orm'

const REDDIT_USER_AGENT = 'ClawFlow:openclaw-agents:v1.0 (by /u/clawflow-bot)'

// Authenticate with Reddit via password grant (script apps only).
// Returns { access_token, expires_in } or throws.
async function redditAuth(clientId: string, clientSecret: string, username: string, password: string): Promise<{ accessToken: string; expiresAt: number }> {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${basicAuth}`,
            'User-Agent': REDDIT_USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    })
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Reddit auth failed (${res.status}): ${text.substring(0, 200)}`)
    }
    const data = await res.json() as { access_token?: string; expires_in?: number; error?: string }
    if (data.error || !data.access_token) {
        throw new Error(`Reddit auth error: ${data.error || 'no token'}`)
    }
    return {
        accessToken: data.access_token,
        expiresAt: Date.now() + ((data.expires_in || 3600) * 1000) - 60000,
    }
}

// ── POST /integrations/reddit/save ──
export const saveRedditCredentials = async (c: Context) => {
    try {
        const body = await c.req.json<{
            instanceId: string
            clientId: string
            clientSecret: string
            username: string
            password: string
        }>()
        const { instanceId, clientId, clientSecret, username, password } = body

        if (!instanceId || !clientId || !clientSecret || !username || !password) {
            return fail(c, 'חסרים פרטי הגדרה: clientId, clientSecret, username, password', 400)
        }

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        // Validate credentials via live auth call
        try {
            await redditAuth(clientId, clientSecret, username, password)
        } catch (authErr) {
            console.error('Reddit auth test failed:', authErr)
            return fail(c, `אימות Reddit נכשל: ${(authErr as Error).message.substring(0, 150)}`, 401)
        }

        // Store as agent integration (per primary agent for this instance)
        const agentType = getPrimaryAgent((instance.selectedComponents as string[]) || [])
        await setAgentIntegration(instanceId, agentType, 'reddit', {
            connected: true,
            connectedAt: new Date().toISOString(),
            username,
            clientId,
            // Secrets stored but masked on reads
            clientSecret,
            password,
        })

        return ok(c, { username, masked: username }, 'Reddit מחובר.')
    } catch (err) {
        console.error('saveRedditCredentials error:', err)
        return fail(c, 'שגיאה בהגדרת Reddit', 500)
    }
}

// ── GET /integrations/reddit/status ──
export const getRedditStatus = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || c.req.param('id')
        if (!instanceId) return fail(c, 'instanceId required', 400)
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const agentType = getPrimaryAgent((instance.selectedComponents as string[]) || [])
        const int = await getAgentIntegration(instanceId, agentType, 'reddit')
        const cfg = (int?.config as any) || {}
        if (!int || !cfg.connected) return ok(c, { connected: false })
        return ok(c, {
            connected: true,
            username: cfg.username || '',
            connectedAt: cfg.connectedAt || null,
        })
    } catch (err) {
        console.error('getRedditStatus error:', err)
        return fail(c, 'Failed to get Reddit status', 500)
    }
}

// ── DELETE /integrations/reddit ──
export const disconnectReddit = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || c.req.param('id')
        if (!instanceId) return fail(c, 'instanceId required', 400)
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const agentType = getPrimaryAgent((instance.selectedComponents as string[]) || [])
        await removeAgentIntegration(instanceId, agentType, 'reddit')
        return ok(c, { disconnected: true }, 'Reddit disconnected.')
    } catch (err) {
        console.error('disconnectReddit error:', err)
        return fail(c, 'Failed to disconnect', 500)
    }
}

// ── POST /integrations/reddit/test ──
// Fetch user's own profile as a live test
export const testReddit = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || c.req.param('id')
        if (!instanceId) return fail(c, 'instanceId required', 400)
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const agentType = getPrimaryAgent((instance.selectedComponents as string[]) || [])
        const int = await getAgentIntegration(instanceId, agentType, 'reddit')
        const cfg = (int?.config as any) || {}
        if (!int || !cfg.connected) return fail(c, 'Reddit not connected', 400)
        const auth = await redditAuth(cfg.clientId, cfg.clientSecret, cfg.username, cfg.password)
        const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
            headers: { 'Authorization': `Bearer ${auth.accessToken}`, 'User-Agent': REDDIT_USER_AGENT },
        })
        if (!meRes.ok) return fail(c, `Test failed (${meRes.status})`, 500)
        const me = await meRes.json() as any
        return ok(c, {
            name: me.name,
            totalKarma: me.total_karma,
            linkKarma: me.link_karma,
            commentKarma: me.comment_karma,
            createdUtc: me.created_utc,
        }, 'Reddit live check passed.')
    } catch (err) {
        console.error('testReddit error:', err)
        return fail(c, `Test failed: ${(err as Error).message.substring(0, 150)}`, 500)
    }
}