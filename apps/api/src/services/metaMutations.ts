/**
 * Phase 4.6 — Meta Marketing API mutations.
 *
 * Distinct from `metaAdsExecutor.ts` (which CREATES entities from draft JSON):
 * these are MUTATIONS on existing campaigns / adsets / ads. They're triggered
 * by the hypothesis executor when an approved hypothesis carries an
 * `apiActionRecipe` whose `api === 'meta_marketing'`.
 *
 * Every method:
 *   - Resolves the Meta context (access token + ad account) from the instance
 *   - Supports `dryRun` mode (no live API call; returns a synthetic OK)
 *   - Captures the pre-state of the entity for potential rollback
 *   - Returns a uniform { ok, before, after, error } envelope
 *
 * Reversibility:
 *   - Budget adjustments capture the prior daily_budget so the caller can
 *     revert via setCampaignDailyBudget(campaignId, before.dailyBudget)
 *   - Bid strategy changes capture prior strategy similarly
 *   - Advantage+ toggles are idempotent (re-applying the same value is a no-op)
 *
 * Auth: uses the same `instance.metaTokens` field that metaAdsExecutor uses.
 */

// @ts-expect-error — facebook-nodejs-business-sdk has no published types
import pkg from 'facebook-nodejs-business-sdk'
const { FacebookAdsApi, Campaign, AdSet, AdAccount } = pkg as any
import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq } from 'drizzle-orm'

export interface MetaMutationResult {
    ok: boolean
    dryRun: boolean
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    error?: string
    /** Synthetic when dryRun=true; real Meta entity ID when live. */
    entityId: string
}

interface MetaContext {
    accessToken: string
    adAccountId: string         // without 'act_' prefix
    mode: 'self' | 'managed'
}

async function getMetaContext(instanceId: string): Promise<MetaContext | { error: string }> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { error: 'Instance not found' }
    const mt = (inst.metaTokens as any) || {}
    const accessToken = mt.accessToken || mt.userAccessToken || mt.pageAccessToken
    const adAccountId = mt.adAccountId
    if (!accessToken) return { error: 'Meta OAuth not connected — reconnect Facebook' }
    if (!adAccountId) return { error: 'Ad Account ID missing — select it in Integrations → Meta' }
    return {
        accessToken,
        adAccountId: String(adAccountId).replace(/^act_/, ''),
        mode: 'self',
    }
}

// ── Mutation: adjust campaign daily budget by percentage ─────────────────
/**
 * Set new daily budget on a Meta campaign.
 * @param campaignId  Meta campaign ID (numeric string)
 * @param newDailyBudgetIls  New daily budget in ILS (Meta accepts integer agorot internally)
 * @param dryRun  When true, validates but doesn't write
 */
export async function setCampaignDailyBudget(
    instanceId: string,
    campaignId: string,
    newDailyBudgetIls: number,
    opts?: { dryRun?: boolean },
): Promise<MetaMutationResult> {
    const dryRun = !!opts?.dryRun
    const ctxOrErr = await getMetaContext(instanceId)
    if ('error' in ctxOrErr) return { ok: false, dryRun, error: ctxOrErr.error, entityId: campaignId }
    const ctx = ctxOrErr

    if (newDailyBudgetIls <= 0) {
        return { ok: false, dryRun, error: 'newDailyBudgetIls must be positive', entityId: campaignId }
    }

    try {
        FacebookAdsApi.init(ctx.accessToken)
        const campaign = new Campaign(campaignId)
        const before = await campaign.read([Campaign.Fields.id, Campaign.Fields.name, Campaign.Fields.daily_budget])
        const beforeBudgetAgorot = Number(before.daily_budget) || 0
        const newBudgetAgorot = Math.round(newDailyBudgetIls * 100)

        if (dryRun) {
            return {
                ok: true,
                dryRun: true,
                before: { dailyBudgetAgorot: beforeBudgetAgorot, dailyBudgetIls: beforeBudgetAgorot / 100, name: before.name },
                after: { dailyBudgetAgorot: newBudgetAgorot, dailyBudgetIls: newDailyBudgetIls },
                entityId: campaignId,
            }
        }

        await campaign.update([], { daily_budget: newBudgetAgorot })
        const after = await campaign.read([Campaign.Fields.id, Campaign.Fields.daily_budget])
        return {
            ok: true,
            dryRun: false,
            before: { dailyBudgetAgorot: beforeBudgetAgorot, dailyBudgetIls: beforeBudgetAgorot / 100, name: before.name },
            after: { dailyBudgetAgorot: Number(after.daily_budget), dailyBudgetIls: Number(after.daily_budget) / 100 },
            entityId: campaignId,
        }
    } catch (err) {
        return { ok: false, dryRun, error: (err as Error).message || 'Meta API call failed', entityId: campaignId }
    }
}

// ── Mutation: adjust budget by a percentage (most common use case) ─────────
/**
 * Multiply the current campaign daily budget by a factor (e.g., 0.8 = -20%).
 * Read-then-write pattern; safer than absolute set when the user thinks in
 * relative terms ("reduce by 20%"). Captures before/after for reversibility.
 */
export async function adjustCampaignBudgetPct(
    instanceId: string,
    campaignId: string,
    factor: number,
    opts?: { dryRun?: boolean },
): Promise<MetaMutationResult> {
    const dryRun = !!opts?.dryRun
    const ctxOrErr = await getMetaContext(instanceId)
    if ('error' in ctxOrErr) return { ok: false, dryRun, error: ctxOrErr.error, entityId: campaignId }
    const ctx = ctxOrErr

    if (factor <= 0 || factor > 5) {
        return { ok: false, dryRun, error: 'factor must be in (0, 5] — refusing extreme adjustments', entityId: campaignId }
    }

    try {
        FacebookAdsApi.init(ctx.accessToken)
        const campaign = new Campaign(campaignId)
        const before = await campaign.read([Campaign.Fields.id, Campaign.Fields.name, Campaign.Fields.daily_budget])
        const beforeAgorot = Number(before.daily_budget) || 0
        const newAgorot = Math.round(beforeAgorot * factor)
        const newDailyBudgetIls = newAgorot / 100

        if (dryRun) {
            return {
                ok: true, dryRun: true,
                before: { dailyBudgetIls: beforeAgorot / 100, name: before.name },
                after: { dailyBudgetIls: newDailyBudgetIls, factor },
                entityId: campaignId,
            }
        }
        await campaign.update([], { daily_budget: newAgorot })
        return {
            ok: true, dryRun: false,
            before: { dailyBudgetIls: beforeAgorot / 100, name: before.name },
            after: { dailyBudgetIls: newDailyBudgetIls, factor },
            entityId: campaignId,
        }
    } catch (err) {
        return { ok: false, dryRun, error: (err as Error).message || 'Meta API call failed', entityId: campaignId }
    }
}

// ── Mutation: toggle Advantage+ Audience Expansion on an adset ────────────
/**
 * Enable or disable Meta's Advantage+ Audience expansion on an adset.
 * Advantage+ Audience expands beyond the manually-defined targeting using
 * Meta's ML — recommended on by default in 2026, but legacy "detailed
 * targeting" adsets often have it disabled.
 */
export async function setAdvantageAudienceExpansion(
    instanceId: string,
    adsetId: string,
    enabled: boolean,
    opts?: { dryRun?: boolean },
): Promise<MetaMutationResult> {
    const dryRun = !!opts?.dryRun
    const ctxOrErr = await getMetaContext(instanceId)
    if ('error' in ctxOrErr) return { ok: false, dryRun, error: ctxOrErr.error, entityId: adsetId }
    const ctx = ctxOrErr

    try {
        FacebookAdsApi.init(ctx.accessToken)
        const adset = new AdSet(adsetId)
        const before = await adset.read([AdSet.Fields.id, AdSet.Fields.name, AdSet.Fields.targeting])
        const beforeTargeting = before.targeting || {}
        const beforeExpansion = !!beforeTargeting.targeting_automation?.advantage_audience

        if (dryRun) {
            return {
                ok: true, dryRun: true,
                before: { advantageAudienceEnabled: beforeExpansion, name: before.name },
                after: { advantageAudienceEnabled: enabled },
                entityId: adsetId,
            }
        }

        const newTargeting = {
            ...beforeTargeting,
            targeting_automation: {
                ...(beforeTargeting.targeting_automation || {}),
                advantage_audience: enabled ? 1 : 0,
            },
        }
        await adset.update([], { targeting: newTargeting })
        return {
            ok: true, dryRun: false,
            before: { advantageAudienceEnabled: beforeExpansion, name: before.name },
            after: { advantageAudienceEnabled: enabled },
            entityId: adsetId,
        }
    } catch (err) {
        return { ok: false, dryRun, error: (err as Error).message || 'Meta API call failed', entityId: adsetId }
    }
}

// ── Mutation: change adset bid strategy ───────────────────────────────────
/**
 * Change an adset's bid strategy. Supported transitions:
 *   - LOWEST_COST_WITHOUT_CAP → COST_CAP / LOWEST_COST_WITH_BID_CAP
 *   - LOWEST_COST → LOWEST_COST_WITH_MIN_ROAS (for value-based campaigns)
 */
export async function setAdsetBidStrategy(
    instanceId: string,
    adsetId: string,
    strategy: 'LOWEST_COST_WITHOUT_CAP' | 'LOWEST_COST_WITH_BID_CAP' | 'COST_CAP' | 'LOWEST_COST_WITH_MIN_ROAS',
    targetValue?: number,         // bid cap (cents) for COST_CAP/BID_CAP; ROAS target (e.g. 2.5) for MIN_ROAS
    opts?: { dryRun?: boolean },
): Promise<MetaMutationResult> {
    const dryRun = !!opts?.dryRun
    const ctxOrErr = await getMetaContext(instanceId)
    if ('error' in ctxOrErr) return { ok: false, dryRun, error: ctxOrErr.error, entityId: adsetId }
    const ctx = ctxOrErr

    try {
        FacebookAdsApi.init(ctx.accessToken)
        const adset = new AdSet(adsetId)
        const before = await adset.read([AdSet.Fields.id, AdSet.Fields.name, AdSet.Fields.bid_strategy, AdSet.Fields.bid_amount])
        const update: Record<string, unknown> = { bid_strategy: strategy }
        if (strategy === 'LOWEST_COST_WITH_BID_CAP' || strategy === 'COST_CAP') {
            if (!targetValue) return { ok: false, dryRun, error: `${strategy} requires bid cap value`, entityId: adsetId }
            update.bid_amount = Math.round(targetValue)
        }
        if (strategy === 'LOWEST_COST_WITH_MIN_ROAS') {
            if (!targetValue) return { ok: false, dryRun, error: 'MIN_ROAS requires roas target', entityId: adsetId }
            update.bid_amount = Math.round(targetValue * 100)         // ROAS stored as integer × 100
        }

        if (dryRun) {
            return {
                ok: true, dryRun: true,
                before: { strategy: before.bid_strategy, bidAmount: before.bid_amount, name: before.name },
                after: { strategy, targetValue },
                entityId: adsetId,
            }
        }
        await adset.update([], update)
        return {
            ok: true, dryRun: false,
            before: { strategy: before.bid_strategy, bidAmount: before.bid_amount, name: before.name },
            after: { strategy, targetValue },
            entityId: adsetId,
        }
    } catch (err) {
        return { ok: false, dryRun, error: (err as Error).message || 'Meta API call failed', entityId: adsetId }
    }
}

// ── Read-only helper: list active campaigns ────────────────────────────────
export async function listActiveCampaigns(
    instanceId: string,
    limit: number = 50,
): Promise<{ ok: boolean; campaigns?: Array<{ id: string; name: string; status: string; dailyBudgetIls: number }>; error?: string }> {
    const ctxOrErr = await getMetaContext(instanceId)
    if ('error' in ctxOrErr) return { ok: false, error: ctxOrErr.error }
    const ctx = ctxOrErr

    try {
        FacebookAdsApi.init(ctx.accessToken)
        const adAccount = new AdAccount('act_' + ctx.adAccountId)
        const result = await adAccount.getCampaigns(
            [Campaign.Fields.id, Campaign.Fields.name, Campaign.Fields.status, Campaign.Fields.daily_budget],
            { limit },
        )
        const campaigns = (result || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            dailyBudgetIls: (Number(c.daily_budget) || 0) / 100,
        }))
        return { ok: true, campaigns }
    } catch (err) {
        return { ok: false, error: (err as Error).message || 'Meta API call failed' }
    }
}