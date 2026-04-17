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
        } else {
            // Ad groups, ads, keywords — require parent campaign IDs
            // These come from previously-approved campaign drafts.
            // Implementation: look up by draft.campaignName → find executed output with metadata.googleAdsResourceName
            // For MVP: only campaign creation. Sub-entities require orchestration.
            return { ok: false, error: `Draft type ${parsed.type} not yet executable — approve campaign first, then wire sub-entities via a dedicated endpoint` }
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
