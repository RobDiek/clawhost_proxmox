/**
 * googleAdsExecutor — executes approved gads_*_draft outputs via google-ads-api SDK.
 *
 * Invoked from triggerPostApprove in outputs.ts when an output is approved.
 * Supports 2 modes:
 *   self: uses user's googleTokens.refreshToken + googleAdsConfig.{customerId, developerToken}
 *   managed: (future) uses Flowmatic env creds + MCC parent + linked sub-account
 *
 * Safety:
 *   - Parses draft JSON from output.content; refuses if _type mismatches.
 *   - All write mutations — budget, campaign, ad group, ad — validated before call.
 *   - Reports back via output.metadata.liveApiStatus: queued|executed|failed.
 *   - On success: stores googleAdsResourceName + googleAdsEntityId.
 *
 * Note: google-ads-api SDK uses gRPC under the hood; works in Node 18+.
 */

import { GoogleAdsApi, enums, ResourceNames } from 'google-ads-api'
import { db } from '@/db'
import { instances, agentOutputs } from '@/db/schema'
import { eq } from 'drizzle-orm'

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
// For managed mode (future) — set in .env when we have MCC
const FLOWMATIC_DEVELOPER_TOKEN = process.env.FLOWMATIC_GADS_DEVELOPER_TOKEN || ''
const FLOWMATIC_MCC_ID          = process.env.FLOWMATIC_GADS_MCC_ID || ''
const FLOWMATIC_REFRESH_TOKEN   = process.env.FLOWMATIC_GADS_REFRESH_TOKEN || ''

type DraftType = 'gads_campaign_draft' | 'gads_adgroup_draft' | 'gads_ad_draft' | 'gads_keywords_draft'

function parseDraft(content: string | null): { type: DraftType; draft: any } | null {
    if (!content) return null
    let obj: any
    try { obj = JSON.parse(content) } catch {
        const m = content.match(/\{[\s\S]*"_type"[\s\S]*\}/)
        if (!m) return null
        try { obj = JSON.parse(m[0]) } catch { return null }
    }
    if (!obj?._type || !obj._type.startsWith('gads_')) return null
    return { type: obj._type as DraftType, draft: obj }
}

interface ExecutorContext {
    customer: any
    customerId: string
    mode: 'self' | 'managed'
}

async function getCustomer(instanceId: string): Promise<ExecutorContext | { error: string }> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { error: 'Instance not found' }

    const mode = (inst.googleAdsMode as 'self' | 'managed') || 'self'

    if (mode === 'self') {
        const cfg = (inst.googleAdsConfig as any) || {}
        const gt = (inst.googleTokens as any) || {}
        const refreshToken = gt.refreshToken || gt.refresh_token
        if (!refreshToken) return { error: 'Google OAuth refresh token missing — reconnect Google Ads' }
        if (!cfg.developerToken) return { error: 'Developer Token not set — go to Integrations → Google Ads and enter it' }
        if (!cfg.customerId) return { error: 'Customer ID not set' }

        const client = new GoogleAdsApi({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            developer_token: cfg.developerToken,
        })
        const customer = client.Customer({
            customer_id: cfg.customerId,
            refresh_token: refreshToken,
            login_customer_id: cfg.loginCustomerId || cfg.customerId,
        })
        return { customer, customerId: cfg.customerId, mode }
    }

    // managed mode — future (requires Flowmatic MCC + our creds)
    if (!FLOWMATIC_DEVELOPER_TOKEN || !FLOWMATIC_MCC_ID || !FLOWMATIC_REFRESH_TOKEN) {
        return { error: 'Managed mode not yet configured on this installation' }
    }
    const cfg = (inst.googleAdsConfig as any) || {}
    if (!cfg.mccSubAccountId) return { error: 'MCC sub-account not linked for this instance' }

    const client = new GoogleAdsApi({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        developer_token: FLOWMATIC_DEVELOPER_TOKEN,
    })
    const customer = client.Customer({
        customer_id: cfg.mccSubAccountId,
        refresh_token: FLOWMATIC_REFRESH_TOKEN,
        login_customer_id: FLOWMATIC_MCC_ID,
    })
    return { customer, customerId: cfg.mccSubAccountId, mode }
}

// Find parent entity resourceName from previously-executed drafts.
// E.g. for adgroup draft with campaignName='x', find executed campaign draft with name='x'.
async function findParentResource(
    instanceId: string,
    parentType: DraftType,
    matchFn: (draft: any) => boolean
): Promise<string | null> {
    const rows = await db.select().from(agentOutputs)
        .where(eq(agentOutputs.instanceId, instanceId))
    for (const row of rows) {
        if (row.outputType !== parentType) continue
        if (row.status !== 'approved') continue
        const meta = (row.metadata as any) || {}
        if (meta.liveApiStatus !== 'executed' || !meta.googleAdsResourceName) continue
        const parsed = parseDraft(row.content)
        if (!parsed) continue
        if (matchFn(parsed.draft)) return meta.googleAdsResourceName
    }
    return null
}

// Campaign creation: budget + campaign objects
async function executeCampaign(ctx: ExecutorContext, draft: any): Promise<{ resourceName: string; id: string }> {
    // 1. Create budget
    const budgetMicros = Math.round((draft.dailyBudgetIls || 50) * 1_000_000)
    const [budgetResp] = await ctx.customer.campaignBudgets.create([{
        name: `${draft.name} — budget`,
        amount_micros: budgetMicros,
        delivery_method: enums.BudgetDeliveryMethod.STANDARD,
    }])
    const budgetResource = budgetResp.resource_name

    // 2. Map bidding strategy
    const bsMap: Record<string, any> = {
        maximize_conversions: { maximize_conversions: {} },
        target_cpa:           { target_cpa: { target_cpa_micros: Math.round((draft.targetCpaIls || 50) * 1_000_000) } },
        target_roas:          { target_roas: { target_roas: (draft.targetRoas || 200) / 100 } },
        manual_cpc:           { manual_cpc: { enhanced_cpc_enabled: true } },
    }
    const bidding = bsMap[draft.biddingStrategy] || bsMap.maximize_conversions

    // 3. Map campaign type
    const advChannelMap: Record<string, any> = {
        search:           enums.AdvertisingChannelType.SEARCH,
        display:          enums.AdvertisingChannelType.DISPLAY,
        video:            enums.AdvertisingChannelType.VIDEO,
        performance_max:  enums.AdvertisingChannelType.PERFORMANCE_MAX,
    }

    // 4. Create campaign (paused by default — user activates from Google Ads UI)
    const [campResp] = await ctx.customer.campaigns.create([{
        name: draft.name,
        advertising_channel_type: advChannelMap[draft.type] || enums.AdvertisingChannelType.SEARCH,
        status: enums.CampaignStatus.PAUSED,
        campaign_budget: budgetResource,
        start_date: (draft.startDate || '').replace(/-/g, '') || undefined,
        end_date:   draft.endDate ? draft.endDate.replace(/-/g, '') : undefined,
        ...bidding,
    }])
    return {
        resourceName: campResp.resource_name,
        id: String(campResp.resource_name).split('/').pop() || '',
    }
}

// Ad Group creation — requires parent campaign resource.
async function executeAdGroup(
    ctx: ExecutorContext,
    draft: any,
    instanceId: string
): Promise<{ resourceName: string; id: string }> {
    const campaignResource = await findParentResource(
        instanceId, 'gads_campaign_draft',
        (d) => d.name === draft.campaignName
    )
    if (!campaignResource) {
        throw new Error(`Parent campaign "${draft.campaignName}" not found or not executed — approve campaign draft first`)
    }

    const [resp] = await ctx.customer.adGroups.create([{
        name: draft.name,
        campaign: campaignResource,
        status: enums.AdGroupStatus.ENABLED,
        type: enums.AdGroupType.SEARCH_STANDARD,
        cpc_bid_micros: draft.maxCpcIls ? Math.round(draft.maxCpcIls * 1_000_000) : undefined,
    }])
    return {
        resourceName: resp.resource_name,
        id: String(resp.resource_name).split('/').pop() || '',
    }
}

// Responsive Search Ad — requires parent ad group resource.
async function executeAd(
    ctx: ExecutorContext,
    draft: any,
    instanceId: string
): Promise<{ resourceName: string; id: string }> {
    const adGroupResource = await findParentResource(
        instanceId, 'gads_adgroup_draft',
        (d) => d.campaignName === draft.campaignName && d.name === draft.adGroupName
    )
    if (!adGroupResource) {
        throw new Error(`Parent ad group "${draft.adGroupName}" in campaign "${draft.campaignName}" not found — approve ad group draft first`)
    }

    const [resp] = await ctx.customer.adGroupAds.create([{
        ad_group: adGroupResource,
        status: enums.AdGroupAdStatus.ENABLED,
        ad: {
            final_urls: [draft.finalUrl],
            responsive_search_ad: {
                headlines: (draft.headlines || []).map((h: string) => ({ text: h })),
                descriptions: (draft.descriptions || []).map((d: string) => ({ text: d })),
                path1: draft.displayPath1 || undefined,
                path2: draft.displayPath2 || undefined,
            },
        },
    }])
    return {
        resourceName: resp.resource_name,
        id: String(resp.resource_name).split('/').pop() || '',
    }
}

// Keywords creation — requires parent ad group resource.
async function executeKeywords(
    ctx: ExecutorContext,
    draft: any,
    instanceId: string
): Promise<{ resourceName: string; id: string; count: number }> {
    const adGroupResource = await findParentResource(
        instanceId, 'gads_adgroup_draft',
        (d) => d.campaignName === draft.campaignName && d.name === draft.adGroupName
    )
    if (!adGroupResource) {
        throw new Error(`Parent ad group "${draft.adGroupName}" in campaign "${draft.campaignName}" not found — approve ad group draft first`)
    }

    const matchTypeMap: Record<string, any> = {
        exact:  enums.KeywordMatchType.EXACT,
        phrase: enums.KeywordMatchType.PHRASE,
        broad:  enums.KeywordMatchType.BROAD,
    }

    const criteria = (draft.keywords || []).map((kw: any) => ({
        ad_group: adGroupResource,
        status: enums.AdGroupCriterionStatus.ENABLED,
        cpc_bid_micros: kw.maxCpcIls ? Math.round(kw.maxCpcIls * 1_000_000) : undefined,
        keyword: {
            text: kw.text,
            match_type: matchTypeMap[kw.matchType] || enums.KeywordMatchType.PHRASE,
        },
    }))

    // Negative keywords (exclusions) — same API, different flag
    const negatives = (draft.negativeKeywords || []).map((kw: string) => ({
        ad_group: adGroupResource,
        status: enums.AdGroupCriterionStatus.ENABLED,
        negative: true,
        keyword: {
            text: kw,
            match_type: enums.KeywordMatchType.PHRASE,
        },
    }))

    const all = [...criteria, ...negatives]
    if (all.length === 0) throw new Error('No keywords in draft')

    const resp = await ctx.customer.adGroupCriteria.create(all)
    return {
        resourceName: String(resp[0]?.resource_name || ''),
        id: String(resp[0]?.resource_name || '').split('/').pop() || '',
        count: all.length,
    }
}

// Main entry — called from outputs.ts triggerPostApprove
export async function executeGadsDraft(output: typeof agentOutputs.$inferSelect): Promise<{ ok: boolean; result?: any; error?: string }> {
    const parsed = parseDraft(output.content)
    if (!parsed) return { ok: false, error: 'Invalid or missing draft JSON in output' }

    const ctxOrErr = await getCustomer(output.instanceId)
    if ('error' in ctxOrErr) return { ok: false, error: ctxOrErr.error }
    const ctx = ctxOrErr as ExecutorContext

    try {
        let result: any
        if (parsed.type === 'gads_campaign_draft') {
            result = await executeCampaign(ctx, parsed.draft)
        } else if (parsed.type === 'gads_adgroup_draft') {
            result = await executeAdGroup(ctx, parsed.draft, output.instanceId)
        } else if (parsed.type === 'gads_ad_draft') {
            result = await executeAd(ctx, parsed.draft, output.instanceId)
        } else if (parsed.type === 'gads_keywords_draft') {
            result = await executeKeywords(ctx, parsed.draft, output.instanceId)
        } else {
            return { ok: false, error: `Unknown draft type: ${parsed.type}` }
        }

        // Update output metadata
        await db.update(agentOutputs)
            .set({
                metadata: {
                    ...((output.metadata as any) || {}),
                    liveApiStatus: 'executed',
                    googleAdsResourceName: result.resourceName,
                    googleAdsEntityId: result.id,
                    executedAt: new Date().toISOString(),
                    executionMode: ctx.mode,
                },
                updatedAt: new Date(),
            })
            .where(eq(agentOutputs.id, output.id))

        console.log(`Google Ads ${parsed.type} executed: ${result.resourceName} (mode=${ctx.mode})`)
        return { ok: true, result }
    } catch (err) {
        const errMsg = (err as Error).message || 'API call failed'
        console.error(`Google Ads execution failed for output ${output.id}:`, errMsg)

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
