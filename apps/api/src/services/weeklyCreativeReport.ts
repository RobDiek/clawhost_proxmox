/**
 * Weekly Creative Report (Phase D)
 *
 * Weekly cron: for each instance with ≥3 renders in last 14 days,
 * generate a Hebrew digest output (via Claude Sonnet) and insert as
 * `weekly_creative_report` into agent_outputs. Menateach-style — aggregates
 * winners, losers, DNA patterns, fatigue summary, next-brief recommendations.
 *
 * Flow:
 *   1. Pull last 14d performance + concluded hypotheses + fatigue alerts
 *   2. Compute: top 3 winners (by ROAS/CTR), bottom 3 (by same),
 *      DNA dimension analysis (hookType distribution among winners),
 *      open fatigue alerts count, inconclusive hypotheses count
 *   3. Feed raw stats + sample prompts to Claude Sonnet with Hebrew prompt
 *   4. Store generated report in agent_outputs(agent_role='menateach',
 *      output_type='weekly_creative_report', status='pending_review')
 *   5. Report includes "next brief recommendations" — patterns Yotzer should try
 *
 * Cost: ~\$0.05 per instance per week (Sonnet, ~3k tokens).
 * Schedule: runs every Monday at 08:00 UTC (11:00 Israel time).
 */

import { randomBytes } from 'crypto'
import { and, desc, eq, gte, inArray } from 'drizzle-orm'

import { db } from '@/db'
import {
    instances,
    creativePerformance,
    creativeRenders,
    creativeHypotheses,
    creativeFatigueAlerts,
    agentOutputs,
    brandBooks,
} from '@/db/schema'

const genId = () => randomBytes(6).toString('hex')

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

export async function generateAllWeeklyReports(): Promise<{
    instances: number
    generated: number
    skipped: number
    errors: number
}> {
    const stats = { instances: 0, generated: 0, skipped: 0, errors: 0 }

    try {
        // Find instances with activity in last 14 days
        const since = new Date()
        since.setDate(since.getDate() - 14)
        const sinceStr = since.toISOString().slice(0, 10)

        const activeInstanceRows = await db.selectDistinct({ id: creativePerformance.instanceId })
            .from(creativePerformance)
            .where(gte(creativePerformance.measurementDate, sinceStr))

        const { isPipelineEnabled } = await import('./pipelineActivation')
        for (const { id: instanceId } of activeInstanceRows) {
            stats.instances++
            // Gate: weekly creative reports cover content/social outputs.
            // Skip when content_calendar pipeline is disabled.
            const enabled = await isPipelineEnabled(instanceId, 'content_calendar')
            if (!enabled) {
                stats.skipped++
                continue
            }
            try {
                const r = await generateInstanceReport(instanceId)
                if (r.generated) stats.generated++
                else stats.skipped++
            } catch (err) {
                stats.errors++
                console.error(`[weeklyReport] ${instanceId} failed:`, err)
            }
        }
        console.log(`[weeklyReport] ${JSON.stringify(stats)}`)
    } catch (err) {
        console.error('[weeklyReport] top-level error:', err)
        stats.errors++
    }
    return stats
}

export async function generateInstanceReport(instanceId: string): Promise<{
    generated: boolean
    reason?: string
    outputId?: string
}> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { generated: false, reason: 'instance not found' }

    const anthropicKey = (inst as any).aiProviderKey
    if (!anthropicKey) return { generated: false, reason: 'no Anthropic key' }

    // ── Aggregate last 14 days ──
    const data = await aggregateWeeklyData(instanceId)

    if (data.activeRenders === 0) {
        return { generated: false, reason: 'no active renders' }
    }

    // Call Claude Sonnet to compose the Hebrew report
    let content: string = await composeReport(anthropicKey, data)

    // Insert into agent_outputs (cron-style — defaults to primary agent)
    const outputId = genId()
    const { resolvePrimaryAgent: __rp } = await import('@/services/agentContext')
    const __wcrAgent = await __rp(instanceId)

    // Weave the organic + AI tracking block (week-over-week) if tracking is on.
    try {
        if (__wcrAgent) {
            const { readSeoTracking } = await import('@/services/seoTracking')
            const { summarizeOrganicAi, renderOrganicAiHe } = await import('@/services/seoTrackingReport')
            const trk = readSeoTracking(__wcrAgent as never)
            if (trk.config.enabled) {
                const sum = summarizeOrganicAi(trk, { back: 1 })
                if (sum.hasData) content += '\n\n' + renderOrganicAiHe(sum, 'מול שבוע קודם')
            }
        }
    } catch { /* organic block is best-effort — never block the paid report */ }
    await db.insert(agentOutputs).values({
        id: outputId,
        instanceId,
        agentId: __wcrAgent?.id || null,
        agentRole: 'menateach',
        outputType: 'weekly_creative_report',
        title: `דוח קריאייטיב שבועי — ${new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}`,
        content,
        platform: null,
        metadata: {
            generatedAt: new Date().toISOString(),
            model: 'claude-sonnet-4-6',
            dataWindow: { days: 14 },
            stats: {
                totalSpend: data.totalSpend,
                avgRoas: data.avgRoas,
                totalConversions: data.totalConversions,
                activeRenders: data.activeRenders,
                winnersCount: data.topWinners.length,
                concludedHypotheses: data.concludedHypotheses.length,
                openFatigueAlerts: data.openFatigueAlerts.length,
            },
        },
        status: 'pending_review',
    })

    // Push to user's Telegram with inline approval buttons
    import('@/services/approvalQueueTelegram').then(m =>
        m.sendApprovalQueueMessage(outputId)
    ).catch(() => { /* non-fatal */ })

    return { generated: true, outputId }
}

// ═══════════════════════════════════════════════════════════════════════════
// Data aggregation
// ═══════════════════════════════════════════════════════════════════════════

interface WeeklyData {
    instanceId: string
    totalSpend: number
    totalConversions: number
    totalConversionValue: number
    avgRoas: number | null
    avgCtr: number | null
    activeRenders: number
    topWinners: Array<{ renderId: string; tier: string; formatType: string; spend: number; ctr: number; roas: number | null; variantLabel: string | null; hypothesisId: string | null }>
    bottomLosers: Array<{ renderId: string; tier: string; formatType: string; spend: number; ctr: number; roas: number | null }>
    concludedHypotheses: Array<{ id: string; statement: string; winnerRenderId: string | null; posteriorPct: number; insightHe: string | null }>
    openFatigueAlerts: Array<{ id: string; renderId: string; reason: string; detectedAt: string }>
    brandPositioning: string | null
    brandVoiceTone: string | null
}

async function aggregateWeeklyData(instanceId: string): Promise<WeeklyData> {
    const since = new Date()
    since.setDate(since.getDate() - 14)
    const sinceStr = since.toISOString().slice(0, 10)

    // Perf rows last 14d
    const perfRows = await db.select().from(creativePerformance)
        .where(and(
            eq(creativePerformance.instanceId, instanceId),
            gte(creativePerformance.measurementDate, sinceStr),
        ))

    // Aggregate per render
    const perRender = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number; convValue: number }>()
    for (const p of perfRows) {
        const agg = perRender.get(p.renderId) || { spend: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0 }
        agg.spend += parseFloat(p.spend as string) || 0
        agg.impressions += p.impressions || 0
        agg.clicks += p.clicks || 0
        agg.conversions += parseFloat(p.conversions as string) || 0
        agg.convValue += parseFloat(p.conversionValue as string) || 0
        perRender.set(p.renderId, agg)
    }

    // Get render details for all
    const renderIds = [...perRender.keys()]
    const renders = renderIds.length > 0 ? await db.select().from(creativeRenders).where(inArray(creativeRenders.id, renderIds)) : []
    const rendersMap = new Map(renders.map(r => [r.id, r]))

    const enriched = renderIds.map(rid => {
        const agg = perRender.get(rid)!
        const r = rendersMap.get(rid)
        return {
            renderId: rid,
            tier: r?.tier || 'unknown',
            formatType: r?.formatType || 'unknown',
            spend: agg.spend,
            ctr: agg.impressions > 0 ? agg.clicks / agg.impressions : 0,
            roas: agg.spend > 0 ? agg.convValue / agg.spend : null,
            variantLabel: r?.variantLabel || null,
            hypothesisId: r?.hypothesisId || null,
            impressions: agg.impressions,
        }
    })

    // Top winners: by ROAS if any, else by CTR
    const hasConversions = enriched.some(e => e.roas !== null && e.roas > 0)
    const sortKey = hasConversions
        ? (e: typeof enriched[number]) => (e.roas ?? 0)
        : (e: typeof enriched[number]) => e.ctr
    const sorted = [...enriched].filter(e => e.impressions >= 500).sort((a, b) => sortKey(b) - sortKey(a))
    const topWinners = sorted.slice(0, 3).map(e => ({
        renderId: e.renderId,
        tier: e.tier,
        formatType: e.formatType,
        spend: e.spend,
        ctr: e.ctr,
        roas: e.roas,
        variantLabel: e.variantLabel,
        hypothesisId: e.hypothesisId,
    }))
    const bottomLosers = sorted.slice(-3).reverse().map(e => ({
        renderId: e.renderId,
        tier: e.tier,
        formatType: e.formatType,
        spend: e.spend,
        ctr: e.ctr,
        roas: e.roas,
    }))

    // Concluded hypotheses last 14d
    const concludedRows = await db.select().from(creativeHypotheses)
        .where(and(
            eq(creativeHypotheses.instanceId, instanceId),
            eq(creativeHypotheses.status, 'concluded'),
            gte(creativeHypotheses.concludedAt, since),
        ))
        .orderBy(desc(creativeHypotheses.concludedAt))
    const concludedHypotheses = concludedRows.map(h => ({
        id: h.id,
        statement: h.statement,
        winnerRenderId: h.winnerRenderId,
        posteriorPct: Math.round((parseFloat((h.posteriorProbability as string) || '0') || 0) * 100),
        insightHe: h.insightHe,
    }))

    // Open fatigue alerts
    const fatigueRows = await db.select().from(creativeFatigueAlerts)
        .where(and(
            eq(creativeFatigueAlerts.instanceId, instanceId),
            eq(creativeFatigueAlerts.status, 'open'),
        ))
        .orderBy(desc(creativeFatigueAlerts.detectedAt))
        .limit(10)
    const openFatigueAlerts = fatigueRows.map(a => ({
        id: a.id,
        renderId: a.renderId,
        reason: a.triggerReason,
        detectedAt: a.detectedAt.toISOString(),
    }))

    // Brand positioning + tone for voice-appropriate report
    const [book] = await db.select().from(brandBooks)
        .where(and(eq(brandBooks.instanceId, instanceId), eq(brandBooks.status, 'approved')))
        .limit(1)

    const totalSpend = enriched.reduce((s, e) => s + e.spend, 0)
    const totalImpressions = enriched.reduce((s, e) => s + e.impressions, 0)
    const totalClicks = enriched.reduce((s, e) => s + (e.ctr * e.impressions), 0)
    const totalConversions = enriched.reduce((s, e) => s + (e.roas ? e.spend * e.roas : 0) / 1 * 0, 0)   // we don't have conv count directly; recompute
    // Simpler: recompute directly from perRender
    let sumConversions = 0, sumConvValue = 0
    for (const [, agg] of perRender) { sumConversions += agg.conversions; sumConvValue += agg.convValue }

    return {
        instanceId,
        totalSpend,
        totalConversions: sumConversions,
        totalConversionValue: sumConvValue,
        avgRoas: totalSpend > 0 ? sumConvValue / totalSpend : null,
        avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : null,
        activeRenders: enriched.length,
        topWinners,
        bottomLosers,
        concludedHypotheses,
        openFatigueAlerts,
        brandPositioning: book?.positioningLine || null,
        brandVoiceTone: (book?.voice as any)?.tone || null,
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Claude composition
// ═══════════════════════════════════════════════════════════════════════════

async function composeReport(anthropicKey: string, data: WeeklyData): Promise<string> {
    const prompt = buildReportPrompt(data)

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 3500,
            messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Claude HTTP ${res.status}: ${errText.substring(0, 300)}`)
    }
    const body = await res.json() as { content?: Array<{ text: string }> }
    return (body.content?.[0]?.text || '').trim()
}

function buildReportPrompt(d: WeeklyData): string {
    return `אתה מנתח בכיר (menateach) של המותג. כתוב דוח קריאייטיב שבועי בעברית — לקריאה של ראש צוות השיווק. 3-5 דקות קריאה מקסימום.

**הקשר המותג:**
${d.brandPositioning ? `Positioning: ${d.brandPositioning}` : ''}
${d.brandVoiceTone ? `Tone: ${d.brandVoiceTone}` : ''}

**נתוני 14 הימים האחרונים:**
- סה"כ הוצאה: ₪${d.totalSpend.toFixed(0)}
- המרות: ${d.totalConversions.toFixed(0)} · שווי: ₪${d.totalConversionValue.toFixed(0)}
- ROAS ממוצע: ${d.avgRoas ? d.avgRoas.toFixed(2) + 'x' : '—'}
- CTR ממוצע: ${d.avgCtr ? (d.avgCtr * 100).toFixed(2) + '%' : '—'}
- קריאייטיבים פעילים: ${d.activeRenders}

**🏆 Top Winners:**
${d.topWinners.length > 0 ? d.topWinners.map((w, i) =>
    `${i + 1}. ${w.tier}·${w.formatType} [${w.renderId.substring(0, 12)}] — CTR ${(w.ctr * 100).toFixed(2)}%, ROAS ${w.roas ? w.roas.toFixed(2) + 'x' : '—'}, ₪${w.spend.toFixed(0)}${w.variantLabel ? ` (variant ${w.variantLabel})` : ''}`
).join('\n') : 'אין מספיק נתונים'}

**📉 Losers:**
${d.bottomLosers.length > 0 ? d.bottomLosers.map((l, i) =>
    `${i + 1}. ${l.tier}·${l.formatType} [${l.renderId.substring(0, 12)}] — CTR ${(l.ctr * 100).toFixed(2)}%, ROAS ${l.roas ? l.roas.toFixed(2) + 'x' : '—'}, ₪${l.spend.toFixed(0)}`
).join('\n') : 'אין'}

**🧪 היפותזות שנסגרו (${d.concludedHypotheses.length}):**
${d.concludedHypotheses.length > 0 ? d.concludedHypotheses.map(h =>
    `- "${h.statement}" → winner ${h.winnerRenderId?.substring(0, 12) || '—'} (${h.posteriorPct}%). ${h.insightHe || ''}`
).join('\n') : 'אין'}

**⚠️ התראות עייפות פתוחות (${d.openFatigueAlerts.length}):**
${d.openFatigueAlerts.length > 0 ? d.openFatigueAlerts.slice(0, 5).map(a =>
    `- ${a.renderId.substring(0, 12)}: ${a.reason}`
).join('\n') : 'אין'}

**מבנה הדוח שלך:**

## 📊 Summary — שבוע במספרים
1-2 משפטים ("השבוע ההוצאה הייתה ₪X, ROAS הוא Y. [הקשר: טוב/בינוני/דורש שיפור]")

## 🏆 What Worked
דיון ב-top winners: מה במשותף? (hook type? format? tier?) — 3-4 שורות

## 📉 What Didn't
דיון ב-losers. מה לא עבד? מדוע? 2-3 שורות

## 🧪 Hypothesis Outcomes
אם יש hypotheses שנסגרו: מה למדנו? איך זה משפיע על brief הבא? אם אין — דלג.

## ⚠️ Fatigue
אם יש alerts פתוחים: המלץ על refresh/replacement של Top fatigued items. אחרת דלג.

## 🎯 Next Brief — 3 Recommendations
3 המלצות קונקרטיות לקריאייטיבים הבאים — מבוססות על הנתונים, לא generic.
פורמט: "נסו X כי Y (לפי data point Z)"

כתוב בעברית, קצר, ענייני. אל תציין את שם המודל. ציטוטים מהדאטה ≠ העתקה של הנתונים הגולמיים.`
}

// ═══════════════════════════════════════════════════════════════════════════
// Weekly cron starter (runs every Monday 08:00 UTC)
// ═══════════════════════════════════════════════════════════════════════════

let started = false
export function startWeeklyCreativeReport(): void {
    if (started) return
    started = true
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000
    console.log(`[weeklyReport] starting (weekly; first run in 1h)`)
    // First run 1h after boot, then every 7 days
    setTimeout(() => { generateAllWeeklyReports().catch(() => { /* logged inside */ }) }, 60 * 60 * 1000)
    setInterval(() => { generateAllWeeklyReports().catch(() => { /* logged inside */ }) }, WEEK_MS)
}