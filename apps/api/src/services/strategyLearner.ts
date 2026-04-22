/**
 * Strategy Lab (Phase G) — weekly learner.
 *
 * For each active instance:
 *   1. Pull 28d of creative_performance joined with content_plan_media and
 *      the content plan item snapshot (inside researchData.contentPlan).
 *   2. Group by 6 dimensions: channel, format, pillar, persona, hook_pattern,
 *      paid_organic. For each, compute per-value median / winner / loser.
 *   3. Store top learning per dimension in `strategy_learnings`. The loader
 *      used by content-plan generation reads latest rows per dimension and
 *      builds a Hebrew block injected into Opus skeleton + Sonnet drafting.
 *
 * Runs Monday 09:15 UTC (15 min after the weekly creative report so that
 * creative_performance is fresh).
 *
 * Cost: 0 LLM — pure SQL + in-memory aggregation. Free to run weekly.
 */
import { randomBytes } from 'crypto'
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm'

import { db } from '@/db'
import {
    instances,
    creativePerformance,
    contentPlanMedia,
    strategyLearnings,
} from '@/db/schema'

type Dimension = 'channel' | 'format' | 'pillar' | 'persona' | 'hook_pattern' | 'paid_organic'

interface DataPoint {
    instanceId: string
    channel: string
    format: string                 // renderType or content plan item type
    pillar: string
    persona: string
    hookPattern: string            // extracted from hook text (question / numbers / persona-named / comparison / generic)
    paidOrOrganic: 'paid' | 'organic'
    spend: number
    impressions: number
    clicks: number
    conversions: number
    conversionValue: number
    ctr: number | null
    roas: number | null
}

// ─── Hook pattern extraction ────────────────────────────────────────────────
// Classify a Hebrew hook into a reusable pattern so we can learn which
// shapes win. Keep the pattern set small and orthogonal (5 buckets).
function classifyHookPattern(hook: string): string {
    const h = (hook || '').trim()
    if (!h) return 'unknown'
    if (/[?？]/.test(h)) return 'question'
    if (/\d/.test(h)) return 'numbers'                       // "10 לקוחות", "₪199"
    if (/^[א-ת]+,\s/.test(h)) return 'persona_named'         // "אסף, "
    if (/\bvs\b|\bאו\b|\bמול\b/i.test(h)) return 'comparison' // "סוכנות או לבד"
    return 'direct_statement'
}

// ─── Main entry — run for one instance ─────────────────────────────────────
export async function runStrategyLearnerForInstance(instanceId: string): Promise<{
    ok: boolean
    learningsWritten: number
    dataPoints: number
    reason?: string
}> {
    const since = new Date()
    since.setDate(since.getDate() - 28)
    const sinceIso = since.toISOString().slice(0, 10)

    // Pull instance to get content plan metadata
    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!instance) return { ok: false, learningsWritten: 0, dataPoints: 0, reason: 'Instance not found' }
    const rd: any = instance.researchData || {}
    const plan: any[] = Array.isArray(rd.contentPlan) ? rd.contentPlan : []
    const planByItemId: Record<string, any> = {}
    for (const it of plan) if (it?.id) planByItemId[it.id] = it

    // Pull creative performance rows joined to media (to recover channel/item)
    const perfRows = await db
        .select({
            perf: creativePerformance,
            media: contentPlanMedia,
        })
        .from(creativePerformance)
        .leftJoin(contentPlanMedia, eq(creativePerformance.renderId, contentPlanMedia.id))
        .where(and(
            eq(creativePerformance.instanceId, instanceId),
            gte(creativePerformance.measurementDate, sinceIso),
        ))

    if (perfRows.length === 0) {
        return { ok: true, learningsWritten: 0, dataPoints: 0, reason: 'No performance data yet' }
    }

    // Assemble data points by joining media → content plan item
    const points: DataPoint[] = []
    for (const row of perfRows) {
        const p = row.perf
        const m = row.media
        const planItem = m?.contentPlanItemId ? planByItemId[m.contentPlanItemId] : null
        points.push({
            instanceId,
            channel: (m?.channel || planItem?.channel || p.platform || 'unknown'),
            format: (m?.renderType || planItem?.type || 'unknown'),
            pillar: planItem?.pillar || 'unknown',
            persona: planItem?.persona || 'unknown',
            hookPattern: classifyHookPattern(planItem?.hook || ''),
            paidOrOrganic: (p.platform === 'meta' || p.platform === 'google_ads' || p.platform === 'tiktok') ? 'paid' : 'organic',
            spend: Number(p.spend || 0),
            impressions: Number(p.impressions || 0),
            clicks: Number(p.clicks || 0),
            conversions: Number(p.conversions || 0),
            conversionValue: Number(p.conversionValue || 0),
            ctr: p.ctr !== null ? Number(p.ctr) : null,
            roas: p.roas !== null ? Number(p.roas) : null,
        })
    }

    // Run 6 dimensions, write top learning for each where we have ≥2 values
    const dims: Dimension[] = ['channel', 'format', 'pillar', 'persona', 'hook_pattern', 'paid_organic']
    const rowsToWrite: Array<typeof strategyLearnings.$inferInsert> = []
    const until = new Date()

    for (const dim of dims) {
        const learning = computeDimensionLearning(dim, points)
        if (!learning) continue
        rowsToWrite.push({
            id: 'sl_' + randomBytes(5).toString('hex'),
            instanceId,
            dimension: dim,
            winnerValue: learning.winner,
            loserValue: learning.loser,
            metric: learning.metric,
            winnerScore: String(learning.winnerScore),
            loserScore: learning.loserScore !== null ? String(learning.loserScore) : null,
            effectSize: String(learning.effectSize),
            dataPointsCount: learning.dataPoints,
            confidence: learning.confidence,
            measuredSince: since,
            measuredUntil: until,
            recommendation: learning.recommendation,
            breakdown: learning.breakdown as any,
        })
    }

    if (rowsToWrite.length > 0) {
        await db.insert(strategyLearnings).values(rowsToWrite)
    }

    return { ok: true, learningsWritten: rowsToWrite.length, dataPoints: points.length }
}

// ─── Per-dimension aggregation ──────────────────────────────────────────────
interface LearningResult {
    winner: string
    loser: string | null
    metric: 'roas' | 'leads' | 'ctr' | 'conversion_rate' | 'engagement_rate'
    winnerScore: number
    loserScore: number | null
    effectSize: number        // winner_score / median
    dataPoints: number
    confidence: 'high' | 'medium' | 'low'
    recommendation: string
    breakdown: Record<string, { score: number; n: number }>
}

function computeDimensionLearning(dim: Dimension, points: DataPoint[]): LearningResult | null {
    const getValue = (p: DataPoint): string => {
        switch (dim) {
            case 'channel': return p.channel
            case 'format': return p.format
            case 'pillar': return p.pillar
            case 'persona': return p.persona
            case 'hook_pattern': return p.hookPattern
            case 'paid_organic': return p.paidOrOrganic
        }
    }

    // Group by dimension value
    const buckets: Record<string, DataPoint[]> = {}
    for (const p of points) {
        const k = getValue(p)
        if (!k || k === 'unknown') continue
        if (!buckets[k]) buckets[k] = []
        buckets[k].push(p)
    }
    const values = Object.keys(buckets)
    if (values.length < 2) return null   // need at least 2 variants to rank

    // Pick the metric most appropriate for dim.
    // For paid dimensions → ROAS. For organic-dominated → conversion_rate or CTR.
    const paidShare = points.filter(p => p.paidOrOrganic === 'paid').length / points.length
    const metric: LearningResult['metric'] = paidShare > 0.3 ? 'roas' : 'conversion_rate'

    // Compute score per bucket
    const scored: Array<{ value: string; score: number; n: number }> = []
    for (const [val, pts] of Object.entries(buckets)) {
        const score = aggregateMetric(metric, pts)
        if (score === null) continue
        scored.push({ value: val, score, n: pts.length })
    }
    if (scored.length < 2) return null

    // Rank
    scored.sort((a, b) => b.score - a.score)
    const winner = scored[0]
    const loser = scored[scored.length - 1]
    const medianScore = scored[Math.floor(scored.length / 2)].score || 0.0001
    const effectSize = winner.score / medianScore

    // Confidence — based on data points behind the winner
    const confidence: LearningResult['confidence'] =
        winner.n >= 20 ? 'high' : winner.n >= 7 ? 'medium' : 'low'

    // Breakdown map
    const breakdown: Record<string, { score: number; n: number }> = {}
    for (const s of scored) breakdown[s.value] = { score: Number(s.score.toFixed(4)), n: s.n }

    return {
        winner: winner.value,
        loser: winner.value === loser.value ? null : loser.value,
        metric,
        winnerScore: Number(winner.score.toFixed(4)),
        loserScore: winner.value === loser.value ? null : Number(loser.score.toFixed(4)),
        effectSize: Number(effectSize.toFixed(3)),
        dataPoints: points.length,
        confidence,
        recommendation: buildRecommendation(dim, winner.value, loser.value, metric, effectSize, confidence),
        breakdown,
    }
}

function aggregateMetric(metric: LearningResult['metric'], pts: DataPoint[]): number | null {
    if (pts.length === 0) return null
    if (metric === 'roas') {
        const spent = pts.reduce((s, p) => s + p.spend, 0)
        const value = pts.reduce((s, p) => s + p.conversionValue, 0)
        return spent > 0 ? value / spent : null
    }
    if (metric === 'conversion_rate') {
        const clicks = pts.reduce((s, p) => s + p.clicks, 0)
        const conv = pts.reduce((s, p) => s + p.conversions, 0)
        return clicks > 0 ? conv / clicks : null
    }
    if (metric === 'ctr') {
        const imps = pts.reduce((s, p) => s + p.impressions, 0)
        const clk = pts.reduce((s, p) => s + p.clicks, 0)
        return imps > 0 ? clk / imps : null
    }
    if (metric === 'leads') {
        return pts.reduce((s, p) => s + p.conversions, 0)
    }
    return null
}

function buildRecommendation(
    dim: Dimension,
    winner: string,
    loser: string,
    metric: string,
    effect: number,
    confidence: string,
): string {
    const dimHe: Record<Dimension, string> = {
        channel: 'הערוץ', format: 'הפורמט', pillar: 'עמוד התוכן', persona: 'הפרסונה',
        hook_pattern: 'סגנון ההוק', paid_organic: 'אורגני/ממומן',
    }
    const metricHe: Record<string, string> = {
        roas: 'ROAS', conversion_rate: 'אחוז המרה', ctr: 'CTR', leads: 'מספר לידים', engagement_rate: 'engagement',
    }
    const confHe: Record<string, string> = { high: 'גבוה', medium: 'בינוני', low: 'נמוך' }
    const effectPct = Math.round((effect - 1) * 100)
    return `${dimHe[dim]} המנצח: "${winner}" (${metricHe[metric]} גבוה ב-${effectPct}% מהחציון). ` +
           (loser ? `המפסיד: "${loser}". ` : '') +
           `ביטחון: ${confHe[confidence]}. המלצה: ${confidence === 'high' ? 'להעלות משמעותית את משקל' : confidence === 'medium' ? 'להעלות מעט את משקל' : 'לבחון שוב אחרי יותר data'} ה${dimHe[dim]} "${winner}" בתכנית הבאה.`
}

// ─── Cron runner ────────────────────────────────────────────────────────────
export async function runAllStrategyLearners(): Promise<{ instances: number; wrote: number; skipped: number }> {
    const stats = { instances: 0, wrote: 0, skipped: 0 }
    const rows = await db.select({ id: instances.id, status: instances.status, rd: instances.researchData })
        .from(instances)
        .where(isNotNull(instances.researchData))
    for (const r of rows) {
        if (r.status !== 'running') continue
        const rd = (r.rd as any) || {}
        if (!rd.chosenScenario) continue
        stats.instances++
        try {
            const result = await runStrategyLearnerForInstance(r.id)
            if (result.ok && result.learningsWritten > 0) stats.wrote += result.learningsWritten
            else stats.skipped++
        } catch (err) {
            console.error(`[strategyLearner] ${r.id} failed:`, err)
            stats.skipped++
        }
    }
    console.log(`[strategyLearner] ${JSON.stringify(stats)}`)
    return stats
}

let started = false
export function startStrategyLearner(): void {
    if (started) return
    started = true
    console.log('[strategyLearner] starting (weekly; first run in 105min)')
    const WEEK = 7 * 24 * 60 * 60 * 1000
    setTimeout(() => { runAllStrategyLearners().catch(() => {}) }, 105 * 60 * 1000)
    setInterval(() => { runAllStrategyLearners().catch(() => {}) }, WEEK)
}

// ─── Helper for content plan prompt injection ──────────────────────────────
// Read last learning per dimension, build Hebrew block. ~600 chars max.
export async function formatStrategyLearningsForPlan(instanceId: string): Promise<string> {
    const rows = await db.select()
        .from(strategyLearnings)
        .where(eq(strategyLearnings.instanceId, instanceId))
        .orderBy(desc(strategyLearnings.createdAt))
        .limit(12)   // latest run produces up to 6 rows; 2 runs covers all dims
    if (rows.length === 0) return ''

    // Dedupe: take first (newest) row per dimension
    const perDim: Record<string, typeof rows[number]> = {}
    for (const row of rows) if (!perDim[row.dimension]) perDim[row.dimension] = row
    const latest = Object.values(perDim)
    if (latest.length === 0) return ''

    const bullets = latest
        .filter(r => r.confidence !== 'low' || (r.effectSize && Number(r.effectSize) > 1.5))
        .map(r => `- ${r.recommendation}`)
    if (bullets.length === 0) return ''

    return `\n## 🧠 Strategy Lab — תובנות ביצועים (28 ימים אחרונים)\nתמדדו את התוצאות מאז הרצה הקודמת ועדכנו:\n${bullets.join('\n')}\n`
}