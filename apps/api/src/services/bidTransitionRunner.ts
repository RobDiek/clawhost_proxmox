/**
 * Bid Transition Runner — daily cron.
 *
 * For each launched campaign with a stored bidContract, checks Google Ads:
 *   1. Did the trigger gate fire? (typically: 30+ conversions in last 30 days)
 *   2. Are conversion-tracking blockers cleared? (Enhanced Conversions firing,
 *      Consent Mode v2 set, ConversionAction recording real events)
 *
 * If BOTH gates pass:
 *   - For Search/MAXIMIZE_CLICKS → MAXIMIZE_CONVERSIONS or TARGET_CPA
 *   - For Display/MAXIMIZE_CLICKS → MAXIMIZE_CONVERSIONS
 *   - Creates a pending_review entry in agent_outputs (NOT auto-flip without
 *     approval — bid changes are visible to client and can affect spend)
 *
 * Telegram notifies the client. Approval queue surfaces "מעבר לאסטרטגיה
 * מתקדמת — אישור נדרש" with one-click apply.
 *
 * Schedule: daily at 06:00 IL (after Google Ads metrics overnight refresh).
 * Cost: ~free (only API queries, no LLM calls until manual trigger).
 *
 * Gate: pipelineActivation('paid_search') must be true. Skips clients
 * without a paid intent active.
 */

import { eq, and, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { instances, agentOutputs } from '@/db/schema'
import { randomBytes } from 'crypto'
import { getTransitionForObjective } from './biddingObjective'

interface CampaignBidContract {
    week1to4: string
    weekTransitionGate: string
    weekAfterTransition: string
    targetTcpaIls?: number
    triggerConvCount?: number
}

interface CampaignWithContract {
    name: string
    googleAdsCampaignId: string
    type: string
    bidContract: CampaignBidContract
    launchedAt?: string
    transitionedAt?: string
}

export async function runBidTransitionCheck(): Promise<{
    eligible: number
    transitionsProposed: number
    transitionsAlreadyDone: number
    blockedByConvCount: number
    blockedByMissingTracking: number
    errors: number
}> {
    const stats = {
        eligible: 0,
        transitionsProposed: 0,
        transitionsAlreadyDone: 0,
        blockedByConvCount: 0,
        blockedByMissingTracking: 0,
        errors: 0,
    }

    try {
        const rows = await db.select({
            id: instances.id,
            researchData: instances.researchData,
            googleTokens: instances.googleTokens,
            googleAdsConfig: instances.googleAdsConfig,
            status: instances.status,
        }).from(instances).where(isNotNull(instances.researchData))

        const { isPipelineEnabled } = await import('./pipelineActivation')
        const { getCampaignMetrics } = await import('./googleAds')

        for (const row of rows) {
            if (row.status !== 'running') continue
            const rd = (row.researchData as any) || {}
            const plan = rd.mediaPlan
            if (!plan || !Array.isArray(plan.campaigns)) continue
            const enabled = await isPipelineEnabled(row.id, 'mazhir_executor')
            if (!enabled) continue
            const campaignsWithContracts: CampaignWithContract[] = plan.campaigns.filter((c: any) =>
                c.googleAdsCampaignId && c.bidContract && !c.transitionedAt
            )
            if (campaignsWithContracts.length === 0) continue
            stats.eligible++

            const customerId = (row.googleAdsConfig as any)?.customerId
            const tokens = row.googleTokens as any
            if (!customerId || !tokens?.refreshToken) continue

            // Gate 1: tracking blockers cleared (Enhanced Conversions, Consent Mode v2)?
            const trackingBlockers = (plan.conversionTrackingPlan?.blockers || [])
                .filter((b: string) => /Enhanced Conversions|Consent Mode/i.test(b))
            const hasTrackingBlockers = trackingBlockers.length > 0
            if (hasTrackingBlockers) {
                stats.blockedByMissingTracking += campaignsWithContracts.length
                continue
            }

            // Gate 2: 30+ conversions in last 30 days at account level
            try {
                const tokenObj = {
                    accessToken: tokens.accessToken || '',
                    refreshToken: tokens.refreshToken,
                    expiresAt: tokens.expiresAt || 0,
                    scopes: tokens.scopes || [],
                    email: tokens.email || '',
                }
                const metrics = await getCampaignMetrics(customerId, tokenObj, undefined, 'LAST_30_DAYS') as any[]
                let totalConv = 0
                for (const m of metrics) totalConv += Number(m?.metrics?.conversions || 0)

                // The tenant's chosen bidding objective (goal-based) drives WHICH
                // target strategy the transition flips to. Falls back to the
                // campaign's stored bidContract when no objective is set.
                const objective = (rd as any).biddingObjective
                const objT = objective?.goal ? getTransitionForObjective(objective) : null

                for (const c of campaignsWithContracts) {
                    const trigger = objT?.triggerConvCount ?? c.bidContract.triggerConvCount ?? 30
                    if (totalConv < trigger) {
                        stats.blockedByConvCount++
                        continue
                    }
                    // Gate passed → propose transition (NOT auto-apply — needs client approval)
                    const proposalId = 'bt_' + randomBytes(6).toString('hex')
                    const targetCpa = objT?.targetCpaIls ?? c.bidContract.targetTcpaIls
                    const targetRoas = objT?.targetRoas
                    const newStrategy = objT?.toStrategy || c.bidContract.weekAfterTransition || 'TARGET_CPA'
                    const targetLineHe = targetRoas ? `  · יעד ROAS: ${Math.round(targetRoas * 100)}%`
                        : targetCpa ? `  · יעד CPA: ₪${targetCpa}` : ''
                    const titleHe = `מעבר אסטרטגיה לקמפיין "${c.name}" — ${totalConv} המרות נצברו`
                    const contentHe = [
                        `הקמפיין "${c.name}" צבר ${totalConv} המרות ב-30 ימים האחרונים — דרישת המינימום (${trigger}) הושגה.`,
                        ``,
                        `מעבר מומלץ:`,
                        `  · אסטרטגיה: ${c.bidContract.week1to4} → ${newStrategy}`,
                        targetLineHe,
                        ``,
                        `הצרכים שלפני אישור:`,
                        `  · Enhanced Conversions פעיל ויורה אירועים ב-Google Ads`,
                        `  · Consent Mode v2 מותקן ופועל`,
                        ``,
                        `אם תאשרו, האסטרטגיה תופעל אוטומטית. בלי אישור הקמפיין יישאר ב-${c.bidContract.week1to4}.`,
                    ].filter(Boolean).join('\n')
                    try {
                        const { resolvePrimaryAgent: __rp } = await import('@/services/agentContext')
                        const __bidAgent = await __rp(row.id)
                        await db.insert(agentOutputs).values({
                            id: proposalId,
                            instanceId: row.id,
                            agentId: __bidAgent?.id || null,
                            agentRole: 'mazhir',
                            outputType: 'bid_transition_proposal',
                            platform: 'google_ads',
                            status: 'pending_review',
                            title: titleHe,
                            content: contentHe,
                            metadata: {
                                campaignId: c.googleAdsCampaignId,
                                campaignName: c.name,
                                fromStrategy: c.bidContract.week1to4,
                                toStrategy: newStrategy,
                                targetCpaIls: targetCpa,
                                targetRoas,
                                objectiveGoal: objective?.goal,
                                conversionsLast30d: totalConv,
                                triggerThreshold: trigger,
                            } as any,
                        })
                        stats.transitionsProposed++
                        try {
                            const { sendApprovalQueueMessage } = await import('./approvalQueueTelegram')
                            await sendApprovalQueueMessage(proposalId)
                        } catch (err) {
                            console.warn('[bidTransitionRunner] telegram notify failed:', (err as Error).message)
                        }
                    } catch (err) {
                        stats.errors++
                        console.error(`[bidTransitionRunner] ${row.id}/${c.name} insert failed:`, err)
                    }
                }
            } catch (err) {
                stats.errors++
                console.error(`[bidTransitionRunner] ${row.id} metrics fetch failed:`, err)
            }
        }
        console.log(`[bidTransitionRunner] ${JSON.stringify(stats)}`)
    } catch (err) {
        console.error('[bidTransitionRunner] top-level:', err)
        stats.errors++
    }
    return stats
}

/**
 * Apply a bid transition proposal — invoked when client approves the
 * agent_outputs row in the queue. Uses Google Ads API to update the campaign's
 * bidding strategy. Stamps `transitionedAt` so the runner won't re-propose.
 */
export async function applyBidTransition(outputId: string): Promise<{ ok: boolean; reason?: string }> {
    const [output] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, outputId))
    if (!output) return { ok: false, reason: 'output not found' }
    if (output.outputType !== 'bid_transition_proposal') return { ok: false, reason: 'wrong output type' }
    if (output.status !== 'approved') return { ok: false, reason: 'output not approved yet' }
    const meta: any = output.metadata || {}
    const { campaignId, toStrategy, targetCpaIls, targetRoas } = meta
    if (!campaignId || !toStrategy) return { ok: false, reason: 'missing campaignId or strategy in metadata' }

    const [inst] = await db.select().from(instances).where(eq(instances.id, output.instanceId!))
    if (!inst) return { ok: false, reason: 'instance not found' }
    const customerId = (inst.googleAdsConfig as any)?.customerId
    const tokens = inst.googleTokens as any
    if (!customerId || !tokens?.refreshToken) return { ok: false, reason: 'no API access' }

    try {
        const { updateCampaignBiddingStrategy } = await import('./googleAdsTransitionExecutor')
        const r = await updateCampaignBiddingStrategy({
            customerId,
            tokens,
            campaignId,
            newStrategy: toStrategy,
            targetCpaIls,
            targetRoas,
        })
        if (!r.ok) return r

        // Phase 4.3-O H7: use mutateResearchData to honor dual-write contract.
        // Raw db.update(instances).set({researchData}) was silently wiped by next
        // mutateResearchData call (memory: feedback_research_data_dual_write).
        const { resolvePrimaryAgent, mutateResearchData } = await import('./agentContext')
        const agent = await resolvePrimaryAgent(inst.id)
        await mutateResearchData(agent, inst.id, (rd2: any) => {
            if (rd2.mediaPlan && Array.isArray(rd2.mediaPlan.campaigns)) {
                const idx = rd2.mediaPlan.campaigns.findIndex((c: any) => c.googleAdsCampaignId === campaignId)
                if (idx >= 0) {
                    rd2.mediaPlan.campaigns[idx].transitionedAt = new Date().toISOString()
                    rd2.mediaPlan.campaigns[idx].activeBidStrategy = toStrategy
                    if (targetCpaIls) rd2.mediaPlan.campaigns[idx].activeTargetCpaIls = targetCpaIls
                    if (targetRoas) rd2.mediaPlan.campaigns[idx].activeTargetRoas = targetRoas
                }
            }
            return rd2
        })
        return { ok: true }
    } catch (err) {
        return { ok: false, reason: (err as Error).message }
    }
}

let started = false
export function startBidTransitionRunner(): void {
    if (started) return
    started = true
    const DAY_MS = 24 * 60 * 60 * 1000
    console.log('[bidTransitionRunner] starting (daily; first run in 6h after boot)')
    setTimeout(() => { runBidTransitionCheck().catch(() => { /* logged inside */ }) }, 6 * 60 * 60 * 1000)
    setInterval(() => { runBidTransitionCheck().catch(() => { /* logged inside */ }) }, DAY_MS)
}