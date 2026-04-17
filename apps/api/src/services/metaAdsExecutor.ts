/**
 * metaAdsExecutor — executes approved mads_*_draft outputs via Meta Marketing API.
 *
 * Pattern mirrors googleAdsExecutor: find parent by name → create entity → update metadata.
 * Uses facebook-nodejs-business-sdk (Meta-maintained, Apache 2.0).
 *
 * Hierarchy: Campaign → Ad Set → Ad
 * (No keywords layer — Meta uses targeting specs inside Ad Set.)
 *
 * Safety:
 *   - Campaigns/ad sets/ads created with status=PAUSED — user must activate in Meta Ads Manager.
 *   - Parent lookup required for adset (by campaignName) and ad (by adSetName + campaignName).
 */

// @ts-expect-error — facebook-nodejs-business-sdk has no types published
import pkg from 'facebook-nodejs-business-sdk'
const { FacebookAdsApi, AdAccount, Campaign, AdSet, Ad, AdCreative } = pkg as any
import { db } from '@/db'
import { instances, agentOutputs } from '@/db/schema'
import { eq } from 'drizzle-orm'

type MetaDraftType = 'mads_campaign_draft' | 'mads_adset_draft' | 'mads_ad_draft'

function parseDraft(content: string | null): { type: MetaDraftType; draft: any } | null {
    if (!content) return null
    let obj: any
    try { obj = JSON.parse(content) } catch {
        const m = content.match(/\{[\s\S]*"_type"[\s\S]*\}/)
        if (!m) return null
        try { obj = JSON.parse(m[0]) } catch { return null }
    }
    if (!obj?._type || !obj._type.startsWith('mads_')) return null
    return { type: obj._type as MetaDraftType, draft: obj }
}

interface MetaContext {
    accessToken: string
    adAccountId: string          // without 'act_' prefix
    pageId?: string
    mode: 'self' | 'managed'
}

async function getMetaContext(instanceId: string): Promise<MetaContext | { error: string }> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { error: 'Instance not found' }

    const mt = (inst.metaTokens as any) || {}
    const accessToken = mt.accessToken || mt.userAccessToken || mt.pageAccessToken
    const adAccountId = mt.adAccountId
    const pageId = mt.pageId

    if (!accessToken) return { error: 'Meta OAuth not connected — reconnect Facebook' }
    if (!adAccountId) return { error: 'Ad Account ID missing — select it in Integrations → Meta' }

    // Clean adAccountId (strip 'act_' prefix if present)
    const cleanId = String(adAccountId).replace(/^act_/, '')

    return { accessToken, adAccountId: cleanId, pageId, mode: 'self' }
}

async function findMetaParentResource(
    instanceId: string,
    parentType: MetaDraftType,
    matchFn: (draft: any) => boolean
): Promise<string | null> {
    const rows = await db.select().from(agentOutputs)
        .where(eq(agentOutputs.instanceId, instanceId))
    for (const row of rows) {
        if (row.outputType !== parentType) continue
        if (row.status !== 'approved') continue
        const meta = (row.metadata as any) || {}
        if (meta.liveApiStatus !== 'executed' || !meta.metaEntityId) continue
        const parsed = parseDraft(row.content)
        if (!parsed) continue
        if (matchFn(parsed.draft)) return meta.metaEntityId
    }
    return null
}

async function executeMetaCampaign(ctx: MetaContext, draft: any): Promise<{ id: string }> {
    FacebookAdsApi.init(ctx.accessToken)
    const adAccount = new AdAccount('act_' + ctx.adAccountId)

    const campaign = await adAccount.createCampaign([Campaign.Fields.id], {
        name: draft.name,
        objective: draft.objective,
        status: 'PAUSED',
        special_ad_categories: draft.specialAdCategories || [],
        buying_type: 'AUCTION',
        [draft.budgetMode === 'daily' ? 'daily_budget' : 'lifetime_budget']: Math.round((draft.budgetIls || 50) * 100), // Meta uses minor units (agorot)
        bid_strategy: draft.bidStrategy || 'LOWEST_COST_WITHOUT_CAP',
    })
    return { id: campaign.id }
}

async function executeMetaAdSet(ctx: MetaContext, draft: any, instanceId: string): Promise<{ id: string }> {
    const campaignId = await findMetaParentResource(
        instanceId, 'mads_campaign_draft',
        (d) => d.name === draft.campaignName
    )
    if (!campaignId) throw new Error(`Parent Meta campaign "${draft.campaignName}" not found — approve campaign first`)

    FacebookAdsApi.init(ctx.accessToken)
    const adAccount = new AdAccount('act_' + ctx.adAccountId)

    // Build targeting spec
    const t = draft.targeting || {}
    const targeting: any = {
        age_min: t.ageMin || 18,
        age_max: t.ageMax || 65,
        geo_locations: { countries: [] as string[], cities: [] as any[] },
    }
    if (t.genders && t.genders.length && !t.genders.includes('all')) {
        targeting.genders = t.genders.map((g: string) => g === 'male' ? 1 : 2)
    }
    if (t.locations) {
        for (const loc of t.locations) {
            if (/^[A-Z]{2}$/.test(loc)) targeting.geo_locations.countries.push(loc)
            else targeting.geo_locations.cities.push({ name: loc, country: 'IL' })
        }
    }
    if (!targeting.geo_locations.countries.length && !targeting.geo_locations.cities.length) {
        targeting.geo_locations.countries.push('IL')
    }

    const params: any = {
        name: draft.name,
        campaign_id: campaignId,
        status: 'PAUSED',
        optimization_goal: draft.optimizationGoal,
        billing_event: draft.billingEvent,
        targeting,
    }
    if (draft.budgetIls) params.daily_budget = Math.round(draft.budgetIls * 100)
    if (draft.startDate) params.start_time = new Date(draft.startDate).toISOString()
    if (draft.endDate)   params.end_time = new Date(draft.endDate).toISOString()

    const adset = await adAccount.createAdSet([AdSet.Fields.id], params)
    return { id: adset.id }
}

async function executeMetaAd(ctx: MetaContext, draft: any, instanceId: string): Promise<{ id: string; creativeId: string }> {
    const adSetId = await findMetaParentResource(
        instanceId, 'mads_adset_draft',
        (d) => d.campaignName === draft.campaignName && d.name === draft.adSetName
    )
    if (!adSetId) throw new Error(`Parent Meta Ad Set "${draft.adSetName}" in "${draft.campaignName}" not found`)
    if (!ctx.pageId) throw new Error('Page ID missing — required for Meta ad creative')

    FacebookAdsApi.init(ctx.accessToken)
    const adAccount = new AdAccount('act_' + ctx.adAccountId)

    // Create creative first
    const creative = await adAccount.createAdCreative([AdCreative.Fields.id], {
        name: draft.name + ' — creative',
        object_story_spec: {
            page_id: ctx.pageId,
            link_data: {
                link: draft.linkUrl,
                message: draft.body,
                name: draft.headline,
                description: draft.description || undefined,
                image_url: draft.imageUrl,
                call_to_action: {
                    type: draft.cta,
                    value: { link: draft.linkUrl },
                },
            },
        },
    })

    const ad = await adAccount.createAd([Ad.Fields.id], {
        name: draft.name,
        adset_id: adSetId,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
    })

    return { id: ad.id, creativeId: creative.id }
}

export async function executeMadsDraft(output: typeof agentOutputs.$inferSelect): Promise<{ ok: boolean; result?: any; error?: string }> {
    const parsed = parseDraft(output.content)
    if (!parsed) return { ok: false, error: 'Invalid or missing Meta draft JSON' }

    const ctxOrErr = await getMetaContext(output.instanceId)
    if ('error' in ctxOrErr) return { ok: false, error: ctxOrErr.error }
    const ctx = ctxOrErr as MetaContext

    try {
        let result: any
        if (parsed.type === 'mads_campaign_draft') {
            result = await executeMetaCampaign(ctx, parsed.draft)
        } else if (parsed.type === 'mads_adset_draft') {
            result = await executeMetaAdSet(ctx, parsed.draft, output.instanceId)
        } else if (parsed.type === 'mads_ad_draft') {
            result = await executeMetaAd(ctx, parsed.draft, output.instanceId)
        } else {
            return { ok: false, error: `Unknown Meta draft type: ${parsed.type}` }
        }

        await db.update(agentOutputs)
            .set({
                metadata: {
                    ...((output.metadata as any) || {}),
                    liveApiStatus: 'executed',
                    metaEntityId: result.id,
                    metaCreativeId: result.creativeId,
                    executedAt: new Date().toISOString(),
                    executionMode: ctx.mode,
                },
                updatedAt: new Date(),
            })
            .where(eq(agentOutputs.id, output.id))

        console.log(`Meta Ads ${parsed.type} executed: entityId=${result.id}`)
        return { ok: true, result }
    } catch (err) {
        const errMsg = (err as Error).message || 'Meta API call failed'
        console.error(`Meta Ads execution failed for ${output.id}:`, errMsg)

        await db.update(agentOutputs)
            .set({
                metadata: {
                    ...((output.metadata as any) || {}),
                    liveApiStatus: 'failed',
                    liveApiError: errMsg.substring(0, 500),
                    failedAt: new Date().toISOString(),
                },
                updatedAt: new Date(),
            })
            .where(eq(agentOutputs.id, output.id))

        return { ok: false, error: errMsg }
    }
}
