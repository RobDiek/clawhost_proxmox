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