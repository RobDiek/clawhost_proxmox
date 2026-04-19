/**
 * Publishing Controller (Phase C)
 *
 * Endpoints:
 *   POST .../creative/publish         — publish a single render to Meta
 *   GET  .../creative/meta/ad-accounts — list user's Meta ad accounts (for UI)
 *   GET  .../creative/meta/campaigns   — list campaigns in an ad account
 *   GET  .../creative/meta/adsets      — list ad sets (by campaign_id or ad_account_id)
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { publishRenderToMeta, listAdAccounts, listCampaigns, listAdSets, type PublishParams } from '@/services/metaPublisher'

// ═══════════════════════════════════════════════════════════════════════════
// POST .../creative/publish
// Body: PublishParams minus instanceId (inferred from route)
// ═══════════════════════════════════════════════════════════════════════════
export const publishToMeta = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<Omit<PublishParams, 'instanceId'>>()
        if (!body.renderId || !body.adAccountId || !body.adSetId || !body.name || !body.linkUrl) {
            return fail(c, 'renderId, adAccountId, adSetId, name, linkUrl — all required', 400)
        }
        if (!/^https?:\/\//i.test(body.linkUrl)) {
            return fail(c, 'linkUrl must be http(s) URL', 400)
        }

        const result = await publishRenderToMeta({ ...body, instanceId })
        if (!result.ok) return fail(c, result.error || 'Publish failed', 500)

        return ok(c, result, 'Published.')
    } catch (err) {
        console.error('publishToMeta error:', err)
        return fail(c, err instanceof Error ? err.message : 'Publish failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET .../creative/meta/ad-accounts
// ═══════════════════════════════════════════════════════════════════════════
export const metaListAdAccounts = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const mt = (inst?.metaTokens as any) || {}
        const token = mt.userAccessToken || mt.pageAccessToken || mt.accessToken
        if (!token) return fail(c, 'Meta token missing', 400)

        const accounts = await listAdAccounts(token)
        return ok(c, { accounts, count: accounts.length })
    } catch (err) {
        console.error('metaListAdAccounts error:', err)
        return fail(c, err instanceof Error ? err.message : 'Fetch failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET .../creative/meta/campaigns?adAccountId=act_123
// ═══════════════════════════════════════════════════════════════════════════
export const metaListCampaigns = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const adAccountId = c.req.query('adAccountId')
        if (!adAccountId) return fail(c, 'adAccountId required', 400)

        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const mt = (inst?.metaTokens as any) || {}
        const token = mt.userAccessToken || mt.pageAccessToken || mt.accessToken
        if (!token) return fail(c, 'Meta token missing', 400)

        const campaigns = await listCampaigns(adAccountId, token)
        return ok(c, { campaigns, count: campaigns.length })
    } catch (err) {
        console.error('metaListCampaigns error:', err)
        return fail(c, err instanceof Error ? err.message : 'Fetch failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET .../creative/meta/adsets?campaignId=... OR adAccountId=...
// ═══════════════════════════════════════════════════════════════════════════
export const metaListAdSets = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const campaignId = c.req.query('campaignId')
        const adAccountId = c.req.query('adAccountId')
        if (!campaignId && !adAccountId) return fail(c, 'campaignId or adAccountId required', 400)

        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const mt = (inst?.metaTokens as any) || {}
        const token = mt.userAccessToken || mt.pageAccessToken || mt.accessToken
        if (!token) return fail(c, 'Meta token missing', 400)

        const adsets = await listAdSets(campaignId || adAccountId!, token, !!campaignId)
        return ok(c, { adsets, count: adsets.length })
    } catch (err) {
        console.error('metaListAdSets error:', err)
        return fail(c, err instanceof Error ? err.message : 'Fetch failed', 500)
    }
}
