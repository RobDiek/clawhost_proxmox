/**
 * Hypothesis Engine — main entry.
 *
 *   runHypothesisEngine(instanceId, opts?) → IngestionResult
 *
 * Pipeline:
 *   1. Build GeneratorContext (paidDataInventory + per-platform aggregates +
 *      per-event breakdown + paidProfile + marketing goals)
 *   2. Run all generators in parallel
 *   3. Collect proposals, persist with dedup
 *   4. Return summary for UI
 *
 * Failure mode: an individual generator failing doesn't fail the engine.
 * We log + continue. The Opus generator is most likely to flake (network /
 * parser); rule generators should not fail unless the DB is down.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import type { GeneratorContext, HypothesisProposal } from './types'
import { persistProposals } from './persist'

import { generateBiddingTierMismatch } from './generators/biddingTierMismatch'
import { generateOutlierPerformance } from './generators/outlierPerformance'
import { generateConversionEventMix } from './generators/conversionEventMix'
import { generateTrackingGap } from './generators/trackingGap'
import { generateFrequencySaturation } from './generators/frequencySaturation'
import { generateCapiEmqAudit } from './generators/capiEmqAudit'
import { generateModeledConversionRatio } from './generators/modeledConversionRatio'
import { generateConsentModeV2 } from './generators/consentModeV2'
import { generateCrossPlatformGap } from './generators/crossPlatformGap'
import { generateGeoExperimentTrigger } from './generators/geoExperimentTrigger'
import { generateOpusAudit } from './generators/opusAudit'

export interface RunOptions {
    /** Skip Opus audit (cheap mode — only rule engines). */
    skipOpusAudit?: boolean
    /** Override default mateh_agent resolution. */
    agentId?: string | null
}

export interface RunResult {
    instanceId: string
    agentId: string | null
    proposalsTotal: number
    proposalsPersisted: number
    duplicatesSkipped: number
    persistedIds: number[]
    perGenerator: Array<{ name: string; proposalsCount: number; errorMessage?: string }>
    contextSummary: {
        tier: string
        platformCount: number
        eventBreakdownCount: number
    }
    durationMs: number
}

async function buildContext(instanceId: string, agentId?: string | null): Promise<GeneratorContext> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId)).limit(1)
    if (!inst) throw new Error(`Instance ${instanceId} not found`)

    // ── Inventory (provides per-platform tier breakdown) ─────────────────
    const { runPaidDataInventory } = await import('../paidDataInventory')
    const inventory = await runPaidDataInventory(instanceId)

    // ── Per-platform + per-event aggregates ──────────────────────────────
    const { aggregateByPlatform, aggregateByEvent } = await import('../dataIngestion/aggregate')
    const [platformAggregates, eventBreakdown] = await Promise.all([
        aggregateByPlatform(instanceId, 90),
        aggregateByEvent(instanceId, 90),
    ])

    // ── Marketing goals + paid profile from research_data ────────────────
    const { resolvePrimaryAgent, readResearchData } = await import('../agentContext')
    const agent = agentId
        ? await db.select().from((await import('@/db/schema')).matehAgents)
            .where(eq((await import('@/db/schema')).matehAgents.id, agentId))
            .limit(1).then(r => r[0])
        : await resolvePrimaryAgent(instanceId)
    const rd: any = await readResearchData(agent, instanceId) || {}
    const marketingGoals = Array.isArray(rd.answers?.marketingGoals) ? rd.answers.marketingGoals as string[] : []
    const paidProfile = rd.paidProfile || {}

    // ── Phase 4.4: cross-platform truth (MER + aMER + per-platform trust) ──
    // Computed once and passed to all generators via context. We swallow
    // failures (truth = null) — generators that need it will skip, others
    // (like biddingTierMismatch) don't touch it.
    let truth: any = null
    try {
        const { getCrossPlatformTruth } = await import('../crossPlatformTruth')
        const full = await getCrossPlatformTruth(instanceId, { windowDays: 30 })
        // Strip down to the lite shape exposed via GeneratorContext to avoid
        // a cross-service type import loop.
        truth = {
            mer: {
                windowDays: full.mer.windowDays,
                spendTotalIls: full.mer.spendTotalIls,
                revenueClaimedIls: full.mer.revenueClaimedIls,
                revenueObservedIls: full.mer.revenueObservedIls,
                revenueAcquisitionClaimedIls: full.mer.revenueAcquisitionClaimedIls,
                revenueAcquisitionObservedIls: full.mer.revenueAcquisitionObservedIls,
                mer: full.mer.mer,
                merObserved: full.mer.merObserved,
                aMer: full.mer.aMer,
                aMerObserved: full.mer.aMerObserved,
                doubleCountGapPct: full.mer.doubleCountGapPct,
                aMerGapPct: full.mer.aMerGapPct,
                platformBreakdown: full.mer.platformBreakdown.map((p: any) => ({
                    platform: p.platform,
                    spendIls: p.spendIls,
                    revenueClaimedIls: p.revenueClaimedIls,
                    revenueAcquisitionIls: p.revenueAcquisitionIls,
                    roasClaimed: p.roasClaimed,
                    share: p.share,
                })),
                quality: {
                    hasObservedChannel: full.mer.quality.hasObservedChannel,
                    observedChannel: full.mer.quality.observedChannel,
                    paidPlatformsActive: full.mer.quality.paidPlatformsActive,
                    spendTotalIsZero: full.mer.quality.spendTotalIsZero,
                },
            },
            trust: {
                perPlatform: full.trust.perPlatform.map((t: any) => ({
                    platform: t.platform,
                    tier: t.tier,
                    tierRank: t.tierRank,
                    tierLabelHe: t.tierLabelHe,
                    rationaleHe: t.rationaleHe,
                    upgradeHintHe: t.upgradeHintHe,
                })),
                compositeScore: full.trust.compositeScore,
                weakestPlatform: full.trust.weakestPlatform,
            },
        }
    } catch (err) {
        console.warn('[hypothesisEngine] cross-platform truth computation failed:', err)
        truth = null
    }

    return {
        instanceId,
        agentId: agent?.id || null,
        inventory: {
            tier: inventory.tier,
            tierRationale: inventory.tierRationale,
            perPlatform: inventory.perPlatform,
            dominantPlatform: inventory.dominantPlatform,
            adapters: inventory.adapters.map(a => ({
                id: a.id,
                connected: a.connected,
                metadata: a.metadata,
            })),
        },
        platformAggregates,
        eventBreakdown,
        marketingGoals,
        paidProfile,
        truth,
        now: new Date(),
    }
}

export async function runHypothesisEngine(instanceId: string, opts?: RunOptions): Promise<RunResult> {
    const start = Date.now()
    const ctx = await buildContext(instanceId, opts?.agentId)

    // ── Run all generators (rule + LLM) in parallel ──────────────────────
    const generators: Array<{
        name: string
        fn: (ctx: GeneratorContext) => Promise<HypothesisProposal[]>
    }> = [
        { name: 'biddingTierMismatch', fn: generateBiddingTierMismatch },
        { name: 'outlierPerformance', fn: generateOutlierPerformance },
        { name: 'conversionEventMix', fn: generateConversionEventMix },
        { name: 'trackingGap', fn: generateTrackingGap },
        { name: 'frequencySaturation', fn: generateFrequencySaturation },
        { name: 'capiEmqAudit', fn: generateCapiEmqAudit },
        { name: 'modeledConversionRatio', fn: generateModeledConversionRatio },
        { name: 'consentModeV2', fn: generateConsentModeV2 },
        { name: 'crossPlatformGap', fn: generateCrossPlatformGap },
        { name: 'geoExperimentTrigger', fn: generateGeoExperimentTrigger },
    ]
    if (!opts?.skipOpusAudit) {
        generators.push({ name: 'opusAudit', fn: generateOpusAudit })
    }

    const results = await Promise.allSettled(generators.map(g => g.fn(ctx)))
    const perGenerator: Array<{ name: string; proposalsCount: number; errorMessage?: string }> = []
    const allProposals: HypothesisProposal[] = []

    for (let i = 0; i < generators.length; i++) {
        const name = generators[i].name
        const r = results[i]
        if (r.status === 'fulfilled') {
            perGenerator.push({ name, proposalsCount: r.value.length })
            allProposals.push(...r.value)
        } else {
            console.error(`[hypothesisEngine] generator ${name} failed:`, r.reason)
            perGenerator.push({ name, proposalsCount: 0, errorMessage: String(r.reason?.message || r.reason).slice(0, 300) })
        }
    }

    // ── Persist ──────────────────────────────────────────────────────────
    const persisted = await persistProposals(instanceId, ctx.agentId ?? null, allProposals)

    return {
        instanceId,
        agentId: ctx.agentId ?? null,
        proposalsTotal: allProposals.length,
        proposalsPersisted: persisted.inserted,
        duplicatesSkipped: persisted.duplicatesSkipped,
        persistedIds: persisted.insertedIds,
        perGenerator,
        contextSummary: {
            tier: ctx.inventory.tier,
            platformCount: ctx.platformAggregates.length,
            eventBreakdownCount: ctx.eventBreakdown.length,
        },
        durationMs: Date.now() - start,
    }
}

// Re-exports for controllers/scripts
export { persistProposals, listHypothesesForInstance, getHypothesis } from './persist'
export {
    approveHypothesis, declineHypothesis, startTesting,
    resolveHypothesis, supersedeHypothesis, expireStaleProposals,
    evaluateCriteria, isOpen, isClosed,
} from './lifecycle'