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
import {
    publishRenderToGoogleAds,
    listGoogleAdsAccounts,
    listGoogleAdsCampaigns,
    listGoogleAdsAdGroups,
    type GoogleAdsPublishParams,
} from '@/services/googleAdsPublisher'
import { appendUtm } from '@/services/utmBuilder'
import { contentPlanMedia, instances as instancesTable } from '@/db/schema'

// Resolve render → content plan item to get rich UTM context (hook + persona)
// before appending utm params. Falls back to just channel+campaign if the
// render isn't linked to a plan item yet (manual/one-off publish).
async function enrichWithUtm(
    instanceId: string,
    renderId: string,
    rawUrl: string,
    channel: string,
    campaignName: string,
): Promise<string> {
    try {
        // Try to find content plan item via media → plan snapshot
        const [media] = await db.select().from(contentPlanMedia)
            .where(eq(contentPlanMedia.id, renderId))
            .limit(1)
        let hook: string | undefined
        let persona: string | undefined
        let contentPlanItemId: string | undefined
        if (media?.contentPlanItemId) {
            contentPlanItemId = media.contentPlanItemId
            const [inst] = await db.select().from(instancesTable).where(eq(instancesTable.id, instanceId))
            const plan = (inst?.researchData as any)?.contentPlan
            if (Array.isArray(plan)) {
                const item = plan.find((p: any) => p?.id === media.contentPlanItemId)
                if (item) { hook = item.hook; persona = item.persona }
            }
        }
        return appendUtm(rawUrl, {
            channel,
            contentPlanItemId,
            hook,
            persona,
            paidCampaignName: campaignName,
        })
    } catch (err) {
        console.warn('[publish/utm] enrich failed, using basic:', (err as Error).message)
        return appendUtm(rawUrl, { channel, paidCampaignName: campaignName })
    }
}

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

        // Auto-tag with UTMs so GA4/Mixpanel/Plausible attribute conversions.
        // Skip if the caller already set utm_source (respects manual override).
        body.linkUrl = await enrichWithUtm(instanceId, body.renderId, body.linkUrl, 'meta_ads', body.name)

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

// ═══════════════════════════════════════════════════════════════════════════
// Google Ads publishing
// ═══════════════════════════════════════════════════════════════════════════

export const publishToGoogleAds = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<Omit<GoogleAdsPublishParams, 'instanceId'>>()
        if (!body.renderId || !body.customerId || !body.adGroupId || !body.adName || !body.finalUrls || !body.headlines || !body.descriptions || !body.businessName) {
            return fail(c, 'renderId, customerId, adGroupId, adName, finalUrls, headlines, descriptions, businessName — all required', 400)
        }

        // Auto-tag every Final URL with UTMs (Google Ads accepts multiple)
        body.finalUrls = await Promise.all(
            body.finalUrls.map(u => enrichWithUtm(instanceId, body.renderId, u, 'google_ads', body.adName))
        )

        const result = await publishRenderToGoogleAds({ ...body, instanceId })
        if (!result.ok) return fail(c, result.error || 'Publish failed', 500)

        return ok(c, result, 'Published.')
    } catch (err) {
        console.error('publishToGoogleAds error:', err)
        return fail(c, err instanceof Error ? err.message : 'Publish failed', 500)
    }
}

export const googleAdsListAccounts = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)
        const accounts = await listGoogleAdsAccounts(instanceId)
        return ok(c, { accounts, count: accounts.length })
    } catch (err) {
        console.error('googleAdsListAccounts error:', err)
        return fail(c, err instanceof Error ? err.message : 'Fetch failed', 500)
    }
}

export const googleAdsListCampaigns = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)
        const customerId = c.req.query('customerId')
        if (!customerId) return fail(c, 'customerId required', 400)
        const campaigns = await listGoogleAdsCampaigns(instanceId, customerId)
        return ok(c, { campaigns, count: campaigns.length })
    } catch (err) {
        console.error('googleAdsListCampaigns error:', err)
        return fail(c, err instanceof Error ? err.message : 'Fetch failed', 500)
    }
}

export const googleAdsListAdGroups = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)
        const customerId = c.req.query('customerId')
        const campaignId = c.req.query('campaignId')
        if (!customerId) return fail(c, 'customerId required', 400)
        const adGroups = await listGoogleAdsAdGroups(instanceId, customerId, campaignId || undefined)
        return ok(c, { adGroups, count: adGroups.length })
    } catch (err) {
        console.error('googleAdsListAdGroups error:', err)
        return fail(c, err instanceof Error ? err.message : 'Fetch failed', 500)
    }
}