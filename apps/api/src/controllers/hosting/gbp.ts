import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances, gbpConfig } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'

const GBP_BASE = 'https://mybusiness.googleapis.com/v4'

// Helper: get Google access token for this instance
async function getGoogleToken(instanceId: string): Promise<string | null> {
    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    const tokens = instance?.googleTokens as any
    if (!tokens?.accessToken) return null

    // Check expiry — refresh if needed
    if (tokens.expiresAt && tokens.expiresAt < Date.now()) {
        // TODO: implement token refresh via Google OAuth
        return null
    }
    return tokens.accessToken
}

async function gbpFetch(token: string, path: string, method = 'GET', body?: unknown): Promise<any> {
    const res = await fetch(`${GBP_BASE}${path}`, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`GBP API ${method} ${path}: ${res.status} — ${text.slice(0, 200)}`)
    }

    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) return {}
    return res.json()
}

// ── Config ──

export const saveGbpConfig = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{
            accountId: string
            locationId: string
            businessName?: string
            autoRepost?: boolean
            reviewCheckFrequency?: string
        }>()

        if (!body.accountId || !body.locationId) return fail(c, 'Account ID and Location ID required', 400)

        await db.insert(gbpConfig).values({
            instanceId,
            accountId: body.accountId,
            locationId: body.locationId,
            businessName: body.businessName || null,
            autoRepost: body.autoRepost !== false,
            reviewCheckFrequency: body.reviewCheckFrequency || 'weekly',
        }).onConflictDoUpdate({
            target: gbpConfig.instanceId,
            set: {
                accountId: body.accountId,
                locationId: body.locationId,
                businessName: body.businessName || null,
                autoRepost: body.autoRepost !== false,
                reviewCheckFrequency: body.reviewCheckFrequency || 'weekly',
            },
        })

        return ok(c, null, 'GBP configured')
    } catch (err) {
        console.error('saveGbpConfig error:', err)
        return fail(c, 'Failed to save GBP config', 500)
    }
}

export const getGbpConfig = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [config] = await db.select().from(gbpConfig).where(eq(gbpConfig.instanceId, instanceId))
        return ok(c, config || null, config ? 'Configured' : 'Not configured')
    } catch (err) {
        console.error('getGbpConfig error:', err)
        return fail(c, 'Failed to get config', 500)
    }
}

// ── Posts ──

export const createGbpPost = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{
            summary: string
            topicType?: string
            callToActionType?: string
            callToActionUrl?: string
            mediaUrl?: string
        }>()

        if (!body.summary) return fail(c, 'Summary required', 400)
        if (body.summary.length > 1500) return fail(c, 'Summary max 1500 characters', 400)

        const token = await getGoogleToken(instanceId)
        if (!token) return fail(c, 'Google not connected or token expired', 401)

        const [config] = await db.select().from(gbpConfig).where(eq(gbpConfig.instanceId, instanceId))
        if (!config?.accountId || !config?.locationId) return fail(c, 'GBP not configured', 400)

        const post: Record<string, unknown> = {
            languageCode: 'he',
            summary: body.summary,
            topicType: body.topicType || 'STANDARD',
        }

        if (body.callToActionType && body.callToActionUrl) {
            post.callToAction = {
                actionType: body.callToActionType,
                url: body.callToActionUrl,
            }
        }

        if (body.mediaUrl) {
            post.media = [{ mediaFormat: 'PHOTO', sourceUrl: body.mediaUrl }]
        }

        const result = await gbpFetch(
            token,
            `/accounts/${config.accountId}/locations/${config.locationId}/localPosts`,
            'POST',
            post
        )

        return ok(c, { postName: result.name }, 'Post created')
    } catch (err) {
        console.error('createGbpPost error:', err)
        return fail(c, 'Failed to create post', 500)
    }
}

// ── Reviews ──

export const getGbpReviews = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const token = await getGoogleToken(instanceId)
        if (!token) return fail(c, 'Google not connected', 401)

        const [config] = await db.select().from(gbpConfig).where(eq(gbpConfig.instanceId, instanceId))
        if (!config?.accountId || !config?.locationId) return fail(c, 'GBP not configured', 400)

        const result = await gbpFetch(
            token,
            `/accounts/${config.accountId}/locations/${config.locationId}/reviews?orderBy=updateTime desc&pageSize=20`
        )

        const reviews = (result.reviews || []).map((r: any) => ({
            id: r.name,
            author: r.reviewer?.displayName || 'Anonymous',
            rating: r.starRating || 0,
            comment: r.comment || '',
            createTime: r.createTime,
            updateTime: r.updateTime,
            hasReply: !!r.reviewReply,
            replyText: r.reviewReply?.comment || null,
        }))

        return ok(c, reviews, `${reviews.length} reviews`)
    } catch (err) {
        console.error('getGbpReviews error:', err)
        return fail(c, 'Failed to get reviews', 500)
    }
}

export const replyToGbpReview = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ reviewName: string; comment: string }>()
        if (!body.reviewName || !body.comment) return fail(c, 'Review name and comment required', 400)

        const token = await getGoogleToken(instanceId)
        if (!token) return fail(c, 'Google not connected', 401)

        // Validate reviewName format to prevent path injection
        if (!/^accounts\/\d+\/locations\/\d+\/reviews\/\w+$/.test(body.reviewName)) {
            return fail(c, 'Invalid review name format', 400)
        }

        await gbpFetch(token, `/${body.reviewName}/reply`, 'PUT', { comment: body.comment })

        return ok(c, null, 'Reply posted')
    } catch (err) {
        console.error('replyToGbpReview error:', err)
        return fail(c, 'Failed to reply', 500)
    }
}
