/**
 * Hypothesis Analyzer (Phase B6)
 *
 * Daily (or on-demand) scan of all pre-registered / running hypotheses:
 *   1. Check if min_spend + min_days met
 *   2. Pull performance data for each variant from creative_performance
 *   3. Run Bayesian analyzer on the primary metric
 *   4. If posterior >= 0.95 → conclude with winner
 *   5. If after 2× min_days still inconclusive → mark inconclusive
 *   6. Generate Hebrew insight + fact for Neo4j (stored for later distribution)
 *
 * Called from:
 *   - Daily cron (after creativePerformanceSync runs)
 *   - POST .../hypotheses/:id/conclude (manual trigger)
 */

import { and, eq, gte, inArray } from 'drizzle-orm'

import { db } from '@/db'
import {
    creativeHypotheses,
    creativePerformance,
    creativeRenders,
    platformCreativeMappings,
} from '@/db/schema'
import { analyzeProportion, analyzeContinuous, type ABResult } from './bayesianAB'

interface HypothesisVariant {
    renderId: string
    label?: string
    predictedLift?: number
    launchedAt?: string
}

interface HypothesisAggregate {
    renderId: string
    label: string
    daysActive: number
    spend: number
    impressions: number
    clicks: number
    conversions: number
    conversionValue: number
    videoPlays: number
    videoP50: number
    firstDay: string | null
    lastDay: string | null
}

// ═══════════════════════════════════════════════════════════════════════════
// Main: analyze all running hypotheses across instances
// ═══════════════════════════════════════════════════════════════════════════

export async function analyzeAllHypotheses(): Promise<{
    total: number
    concluded: number
    stillRunning: number
    inconclusive: number
    errors: number
}> {
    const stats = { total: 0, concluded: 0, stillRunning: 0, inconclusive: 0, errors: 0 }

    const running = await db.select().from(creativeHypotheses)
        .where(inArray(creativeHypotheses.status, ['pre_registered', 'running']))

    stats.total = running.length

    for (const h of running) {
        try {
            const r = await analyzeHypothesis(h.id)
            if (r.outcome === 'concluded' || r.outcome === 'inconclusive') stats.concluded++   // counted as finalized
            if (r.outcome === 'running') stats.stillRunning++
            if (r.outcome === 'inconclusive') stats.inconclusive++
        } catch (err) {
            stats.errors++
            console.error(`[hypothesisAnalyzer] ${h.id} failed:`, err)
        }
    }

    return stats
}

// ═══════════════════════════════════════════════════════════════════════════
// Analyze a single hypothesis
// ═══════════════════════════════════════════════════════════════════════════

export async function analyzeHypothesis(hypothesisId: string): Promise<{
    outcome: 'running' | 'concluded' | 'inconclusive' | 'invalid'
    reason?: string
    result?: ABResult
}> {
    const [h] = await db.select().from(creativeHypotheses).where(eq(creativeHypotheses.id, hypothesisId))
    if (!h) return { outcome: 'invalid', reason: 'Hypothesis not found' }

    if (h.status !== 'pre_registered' && h.status !== 'running') {
        return { outcome: 'invalid', reason: `Status is ${h.status}, cannot analyze` }
    }

    const variants = h.variants as HypothesisVariant[]
    if (!Array.isArray(variants) || variants.length < 2) {
        return { outcome: 'invalid', reason: 'Need at least 2 variants' }
    }

    // Aggregate perf for each variant
    const aggregates: HypothesisAggregate[] = []
    for (const v of variants) {
        const agg = await aggregateRenderPerformance(h.instanceId, v.renderId)
        aggregates.push({ ...agg, label: v.label || v.renderId })
    }

    const minSpend = parseFloat(h.minSpendIls as string) || 0
    const minDays = h.minDaysRunning || 7

    // Guardrail: all variants must meet min_spend AND min_days
    const notReady = aggregates.filter(a => a.spend < minSpend || a.daysActive < minDays)
    if (notReady.length > 0) {
        // Update status to 'running' if it was 'pre_registered'
        if (h.status === 'pre_registered' && aggregates.some(a => a.daysActive > 0)) {
            await db.update(creativeHypotheses)
                .set({ status: 'running', updatedAt: new Date() })
                .where(eq(creativeHypotheses.id, hypothesisId))
        }

        const blocker = notReady
            .map(a => `${a.label} (spend ₪${a.spend.toFixed(0)}/${minSpend}, ${a.daysActive}d/${minDays}d)`)
            .join('; ')
        return {
            outcome: 'running',
            reason: `Guardrails not met: ${blocker}`,
        }
    }

    // Run Bayesian analyzer on primary metric
    const metric = h.primaryMetric as ABResult['metric']
    let result: ABResult

    if (metric === 'ctr' || metric === 'hook_rate' || metric === 'conversion_rate') {
        const proportionData = aggregates.map(a => ({
            id: a.renderId,
            data: buildProportionData(a, metric),
        }))
        result = analyzeProportion(proportionData, h.controlRenderId, metric)
    } else if (metric === 'roas') {
        const continuousData = aggregates.map(a => ({
            id: a.renderId,
            data: {
                mean: a.spend > 0 ? a.conversionValue / a.spend : 0,
                nSamples: a.daysActive,
            },
        }))
        result = analyzeContinuous(continuousData, h.controlRenderId, metric)
    } else {
        return { outcome: 'invalid', reason: `Unsupported metric: ${metric}` }
    }

    // Check if we can conclude
    if (result.isDecisive && result.winnerId) {
        await concludeHypothesis(h, result, aggregates)
        return { outcome: 'concluded', result }
    }

    // Check if we've been running >= 2×min_days and still not decisive → inconclusive
    const maxDaysActive = Math.max(...aggregates.map(a => a.daysActive))
    if (maxDaysActive >= minDays * 2) {
        await markInconclusive(h, result, aggregates, `ran ${maxDaysActive}d, posterior max ${result.winnerPBeatsAll.toFixed(3)} < 0.95`)
        return { outcome: 'inconclusive', result }
    }

    // Still running — update status + log progress
    await db.update(creativeHypotheses)
        .set({ status: 'running', analysis: result as any, updatedAt: new Date() })
        .where(eq(creativeHypotheses.id, hypothesisId))

    return { outcome: 'running', result }
}

// ═══════════════════════════════════════════════════════════════════════════
// Aggregation: sum performance across all days + platforms for one render
// ═══════════════════════════════════════════════════════════════════════════

async function aggregateRenderPerformance(instanceId: string, renderId: string): Promise<Omit<HypothesisAggregate, 'label'>> {
    const rows = await db.select().from(creativePerformance)
        .where(and(
            eq(creativePerformance.instanceId, instanceId),
            eq(creativePerformance.renderId, renderId),
        ))

    if (rows.length === 0) {
        return {
            renderId, daysActive: 0, spend: 0, impressions: 0, clicks: 0,
            conversions: 0, conversionValue: 0, videoPlays: 0, videoP50: 0,
            firstDay: null, lastDay: null,
        }
    }

    let spend = 0, impressions = 0, clicks = 0, conversions = 0, conversionValue = 0
    let videoPlays = 0, videoP50 = 0
    const days = new Set<string>()
    let firstDay: string | null = null
    let lastDay: string | null = null

    for (const r of rows) {
        spend += parseFloat(r.spend as string || '0') || 0
        impressions += r.impressions || 0
        clicks += r.clicks || 0
        conversions += parseFloat(r.conversions as string || '0') || 0
        conversionValue += parseFloat(r.conversionValue as string || '0') || 0
        videoPlays += r.videoPlays || 0
        videoP50 += r.videoP50 || 0
        const d = r.measurementDate
        if (d) {
            days.add(d)
            if (!firstDay || d < firstDay) firstDay = d
            if (!lastDay || d > lastDay) lastDay = d
        }
    }

    return {
        renderId,
        daysActive: days.size,
        spend, impressions, clicks, conversions, conversionValue,
        videoPlays, videoP50,
        firstDay, lastDay,
    }
}

function buildProportionData(a: HypothesisAggregate, metric: ABResult['metric']): { successes: number; total: number } {
    switch (metric) {
        case 'ctr':              return { successes: a.clicks, total: a.impressions }
        case 'hook_rate':        return { successes: a.videoPlays, total: a.impressions }
        case 'conversion_rate':  return { successes: Math.round(a.conversions), total: a.clicks }
        default:                 return { successes: a.clicks, total: Math.max(a.impressions, 1) }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Conclude — winner found
// ═══════════════════════════════════════════════════════════════════════════

async function concludeHypothesis(
    h: typeof creativeHypotheses.$inferSelect,
    result: ABResult,
    aggregates: HypothesisAggregate[],
): Promise<void> {
    if (!result.winnerId) return

    const losers = aggregates.map(a => a.renderId).filter(id => id !== result.winnerId)
    const winnerAgg = aggregates.find(a => a.renderId === result.winnerId)!

    // Build Hebrew insight — descriptive, includes metric lift
    const winner = (h.variants as HypothesisVariant[]).find(v => v.renderId === result.winnerId)
    const winnerLabel = winner?.label || 'A'
    const metricLabels: Record<string, string> = {
        ctr: 'CTR',
        roas: 'ROAS',
        hook_rate: 'Hook Rate',
        conversion_rate: 'שיעור המרה',
    }
    const metricHe = metricLabels[result.metric] || result.metric
    const liftStr = result.liftVsControlPct !== null ? ` (+${result.liftVsControlPct.toFixed(1)}% מעל הקונטרול)` : ''
    const pPct = Math.round(result.winnerPBeatsAll * 100)

    const insightHe = `ההיפותזה "${h.statement}" אושרה: וריאציה ${winnerLabel} ניצחה ב-${metricHe}${liftStr}. ביטחון: ${pPct}%.`
    const insightEn = `Hypothesis "${h.statement}" confirmed: variant ${winnerLabel} won on ${metricHe}${result.liftVsControlPct !== null ? ` (+${result.liftVsControlPct.toFixed(1)}% over control)` : ''}. Posterior: ${pPct}%.`

    // Fact triple — for later distribution to Neo4j
    const factPayload = {
        subject: `creative:${result.winnerId}`,
        predicate: 'WON_HYPOTHESIS',
        object: `hypothesis:${h.id}`,
        metadata: {
            metric: result.metric,
            posterior: result.winnerPBeatsAll,
            liftPct: result.liftVsControlPct,
            sampleSize: result.sampleCount,
            statement: h.statement,
        },
        validFrom: new Date().toISOString(),
        source: 'hypothesis_analyzer',
    }

    await db.update(creativeHypotheses)
        .set({
            status: 'concluded',
            concludedAt: new Date(),
            winnerRenderId: result.winnerId,
            loserRenderIds: losers,
            posteriorProbability: String(result.winnerPBeatsAll),
            metricLiftPct: result.liftVsControlPct !== null ? String(result.liftVsControlPct) : null,
            analysis: result as any,
            insightHe,
            insightEn,
            savedAsFact: factPayload,
            updatedAt: new Date(),
        })
        .where(eq(creativeHypotheses.id, h.id))

    // Mark the winner render for future Yotzer reuse (boost priority in gallery etc)
    await db.update(creativeRenders)
        .set({ userRating: Math.max(parseInt(String(winnerAgg.conversions > 0 ? 5 : 4), 10), 4) })
        .where(eq(creativeRenders.id, result.winnerId))

    console.log(`[hypothesisAnalyzer] ${h.id} CONCLUDED — winner ${result.winnerId} with P=${pPct}% (metric=${result.metric})`)
}

async function markInconclusive(
    h: typeof creativeHypotheses.$inferSelect,
    result: ABResult,
    aggregates: HypothesisAggregate[],
    reason: string,
): Promise<void> {
    const insightHe = `ההיפותזה "${h.statement}" לא הגיעה לרף סטטיסטי אחרי ${Math.max(...aggregates.map(a => a.daysActive))} ימים. אין הבדל מובהק בין הוריאציות.`

    await db.update(creativeHypotheses)
        .set({
            status: 'inconclusive',
            concludedAt: new Date(),
            analysis: result as any,
            posteriorProbability: String(result.winnerPBeatsAll),
            abandonedReason: reason,
            insightHe,
            updatedAt: new Date(),
        })
        .where(eq(creativeHypotheses.id, h.id))

    console.log(`[hypothesisAnalyzer] ${h.id} INCONCLUSIVE — ${reason}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// Cron starter — runs daily, 15 minutes after perfSync (so fresh data is in)
// ═══════════════════════════════════════════════════════════════════════════

let started = false
export function startHypothesisAnalyzer(): void {
    if (started) return
    started = true
    const INTERVAL_MS = 24 * 60 * 60 * 1000
    console.log(`[hypothesisAnalyzer] starting (interval 24h, 15min delay)`)
    // 15 min delay after startup lets perfSync finish first
    setTimeout(() => { analyzeAllHypotheses().catch(err => console.error('[hypothesisAnalyzer] cron error:', err)) }, 15 * 60 * 1000)
    setInterval(() => { analyzeAllHypotheses().catch(err => console.error('[hypothesisAnalyzer] cron error:', err)) }, INTERVAL_MS)
}
