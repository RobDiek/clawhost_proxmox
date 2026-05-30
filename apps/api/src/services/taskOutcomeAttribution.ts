/**
 * K18 — Task Outcome Attribution
 *
 * Daily cron that closes the loop between "task completed" and "did it
 * actually move the metric we promised?". For each tenant agent, scans
 * research_data.monthlyPlan.tasks[] for entries where:
 *
 *   status === 'completed'
 *   AND completedAt + task.expectedImpact.horizon  ≤  now
 *   AND actualImpact has not been measured yet
 *
 * Routes the task to a per-channel adapter that pulls the real metric
 * (Google Ads spend/CPA/conversions, GA4 sessions/events, GSC clicks/
 * position) and writes back:
 *
 *   actualImpact = {
 *     metric, value, horizon, measuredAt, rationale,
 *     deltaVsExpected (signed % delta),
 *     realizedPct (actual / expected as %),
 *     category ('hit' | 'mixed' | 'missed' | 'unknown'),
 *     source  ('automated_paid' | 'automated_seo' | 'automated_content'
 *              | 'measurement_gap' | 'manual' | 'no_data'),
 *     evidence ([ "campaignId=123", "ga4_event=click_on_whatsapp" ])
 *   }
 *
 * Manual tasks bypass this cron — founder populates actualImpact directly
 * via the markManualDone popup. Tasks where we have no signal (e.g.
 * cross-channel without campaign IDs) get source='no_data', category=
 * 'unknown' so monthlyReauditRunner can distinguish "no measurement
 * attempted" from "actively measured and missed".
 *
 * Honors feedback_research_data_dual_write — all writes go through
 * mutateResearchData on agentContext.
 */

import { isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import type { MonthlyTask } from '@/controllers/hosting/agentSetup'

// ─── Eligibility helpers ───────────────────────────────────────────────────

function horizonDays(h: string | undefined): number {
    const m = /^(\d+)d$/.exec(h || '')
    return m ? Number(m[1]) : 30
}

function isEligibleForAttribution(task: MonthlyTask, now: Date): boolean {
    if (task.status !== 'completed') return false
    if (!task.completedAt) return false
    if (task.actualImpact?.measuredAt) return false   // already measured
    const completedAt = new Date(task.completedAt).getTime()
    if (Number.isNaN(completedAt)) return false
    const eligibleAt = completedAt + horizonDays(task.expectedImpact?.horizon) * 24 * 3600 * 1000
    return now.getTime() >= eligibleAt
}

function categorize(realizedPct: number | undefined): 'hit' | 'mixed' | 'missed' | 'unknown' {
    if (realizedPct == null || !Number.isFinite(realizedPct)) return 'unknown'
    if (realizedPct >= 80) return 'hit'
    if (realizedPct >= 50) return 'mixed'
    return 'missed'
}

// ─── Per-channel adapters ──────────────────────────────────────────────────

interface AdapterResult {
    value: number | null
    source: 'automated_paid' | 'automated_seo' | 'automated_content' | 'measurement_gap' | 'no_data'
    evidence: string[]
    rationale: string                      // Hebrew narrative
}

function extractCampaignIds(task: MonthlyTask): string[] {
    const ids = new Set<string>()
    const refRegex = /campaign(?:Id)?[:=](\d+)|campaigns?\/(\d+)/gi
    for (const s of task.sources || []) {
        const refStr = `${s.ref || ''} ${s.excerpt || ''}`
        let m: RegExpExecArray | null
        while ((m = refRegex.exec(refStr)) !== null) {
            ids.add(m[1] || m[2])
        }
    }
    if (task.executionOutcome?.outputDescription) {
        let m: RegExpExecArray | null
        while ((m = refRegex.exec(task.executionOutcome.outputDescription)) !== null) {
            ids.add(m[1] || m[2])
        }
    }
    return [...ids]
}

function extractUrls(task: MonthlyTask): string[] {
    const urls = new Set<string>()
    const urlRegex = /\bhttps?:\/\/[^\s"'<>)]+/g
    const txt = `${task.title || ''} ${task.summary || ''} ${task.executionOutcome?.outputDescription || ''}`
    let m: RegExpExecArray | null
    while ((m = urlRegex.exec(txt)) !== null) {
        urls.add(m[0].replace(/[.,;)\]]+$/, ''))
    }
    return [...urls]
}

async function attributePaid(
    task: MonthlyTask,
    instanceId: string,
    rd: any,
): Promise<AdapterResult> {
    const campaignIds = extractCampaignIds(task)
    if (campaignIds.length === 0) {
        return {
            value: null,
            source: 'no_data',
            evidence: [],
            rationale: 'אין מזהי קמפיין נשמרו על המשימה — לא ניתן לחשב השפעה בפועל אוטומטית',
        }
    }
    try {
        const { db: dbInner } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq: eqOp } = await import('drizzle-orm')
        const [inst] = await dbInner.select().from(instances).where(eqOp(instances.id, instanceId))
        if (!inst) throw new Error('instance not found')
        const cfg: any = (inst as any).googleAdsConfig || {}
        if (!cfg.customerId || !cfg.developerToken) throw new Error('Ads not connected')
        const tokens: any = (inst as any).googleTokens
        if (!tokens?.refreshToken) throw new Error('OAuth missing')

        const { getCampaignMetrics } = await import('@/services/googleAds')
        let totalCostMicros = 0, totalConv = 0, totalClicks = 0
        const horizon = task.expectedImpact?.horizon || '30d'
        const dateRange = horizon === '7d' ? 'LAST_7_DAYS'
            : horizon === '14d' ? 'LAST_14_DAYS'
            : horizon === '60d' ? 'LAST_60_DAYS'
            : horizon === '90d' ? 'LAST_90_DAYS'
            : 'LAST_30_DAYS'
        for (const cid of campaignIds) {
            try {
                const rows = await getCampaignMetrics(cfg.customerId, tokens, cid, dateRange, cfg.loginCustomerId) as any[]
                for (const r of rows) {
                    totalCostMicros += Number(r?.metrics?.cost_micros || 0)
                    totalConv += Number(r?.metrics?.conversions || 0)
                    totalClicks += Number(r?.metrics?.clicks || 0)
                }
            } catch (err) {
                console.warn(`[taskOutcomeAttribution] paid metrics for cid=${cid} failed:`, (err as Error).message)
            }
        }
        const spendIls = totalCostMicros / 1_000_000
        const cpa = totalConv > 0 ? spendIls / totalConv : null

        // Map metric → value extraction
        const expectedMetric = task.expectedImpact?.metric
        let value: number | null = null
        if (expectedMetric === 'conversions') value = totalConv
        else if (expectedMetric === 'cpa_reduction_pct' && cpa != null) value = cpa
        else if (expectedMetric === 'spend_savings_ils') value = spendIls
        else if (expectedMetric === 'ctr_pct') value = totalClicks // partial — we don't have impressions here
        else value = totalConv   // fallback signal

        return {
            value,
            source: 'automated_paid',
            evidence: campaignIds.map(c => `campaignId=${c}`),
            rationale: `נמדד מ-Google Ads עבור ${campaignIds.length} קמפיינים בחלון ${dateRange} — ${totalConv.toFixed(1)} המרות, ₪${spendIls.toFixed(0)} הוצאה`,
        }
    } catch (err) {
        return {
            value: null,
            source: 'no_data',
            evidence: campaignIds.map(c => `campaignId=${c}`),
            rationale: `שגיאה במשיכת נתוני Google Ads: ${(err as Error).message.slice(0, 80)}`,
        }
    }
}

async function attributeSeo(
    task: MonthlyTask,
    instanceId: string,
    rd: any,
): Promise<AdapterResult> {
    const urls = extractUrls(task)
    try {
        const { db: dbInner } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq: eqOp } = await import('drizzle-orm')
        const [inst] = await dbInner.select().from(instances).where(eqOp(instances.id, instanceId))
        if (!inst) throw new Error('instance not found')
        const gscTokens: any = (inst as any).gscTokens || (inst as any).googleTokens
        if (!gscTokens?.refreshToken) throw new Error('GSC OAuth missing')

        // Multi-agent VPS: inst.websiteUrl holds the PRIMARY agent's domain.
        // For secondary agents (e.g. Packing Station on Storage Station's VPS)
        // the agent's research_data.answers.websiteUrl is authoritative.
        // Fall back to instance only if agent-specific answer is missing.
        const websiteUrl: string | undefined = rd?.answers?.websiteUrl || (inst as any).websiteUrl
        const horizon = task.expectedImpact?.horizon || '30d'
        const days = horizonDays(horizon)

        const { pullGSCPages } = await import('@/services/gscPagesEnrich')
        const gsc = await pullGSCPages(gscTokens, websiteUrl, days)
        if (!gsc.available) {
            return {
                value: null,
                source: 'no_data',
                evidence: urls.map(u => `url=${u}`),
                rationale: `GSC לא זמין: ${gsc.reason}`,
            }
        }
        const matchedPages = urls.length > 0
            ? gsc.pages.filter(p => urls.some(u => p.page === u || u.includes(p.page) || p.page.includes(u)))
            : []
        const sampleSet = matchedPages.length > 0 ? matchedPages : gsc.pages.slice(0, 5)
        const totalClicks = sampleSet.reduce((s, p) => s + (p.clicks || 0), 0)
        const totalImpr = sampleSet.reduce((s, p) => s + (p.impressions || 0), 0)
        const avgPos = sampleSet.length > 0
            ? sampleSet.reduce((s, p) => s + (p.position || 0), 0) / sampleSet.length
            : null
        const expectedMetric = task.expectedImpact?.metric
        let value: number | null = totalClicks
        if (expectedMetric === 'ranking_position' && avgPos != null) value = avgPos
        else if (expectedMetric === 'organic_traffic_pct') value = totalClicks
        else if (expectedMetric === 'ctr_pct' && totalImpr > 0) value = (totalClicks / totalImpr) * 100

        return {
            value,
            source: 'automated_seo',
            evidence: sampleSet.slice(0, 3).map(p => `url=${p.page}`),
            rationale: `נמדד מ-GSC עבור ${sampleSet.length} דפים בחלון ${days} ימים — ${totalClicks} קליקים, מיקום ממוצע ${avgPos?.toFixed(1) || '?'}`,
        }
    } catch (err) {
        return {
            value: null,
            source: 'no_data',
            evidence: urls.map(u => `url=${u}`),
            rationale: `שגיאה במדידה אורגנית: ${(err as Error).message.slice(0, 80)}`,
        }
    }
}

async function attributeMeasurementGap(
    task: MonthlyTask,
    instanceId: string,
    rd: any,
): Promise<AdapterResult> {
    const trackingScore = rd?.mazhirAudit?.trackingHealth?.score
    if (typeof trackingScore === 'number') {
        return {
            value: trackingScore,
            source: 'measurement_gap',
            evidence: ['mazhirAudit.trackingHealth.score'],
            rationale: `ציון בריאות מעקב נוכחי: ${trackingScore}/100 (מ-Mazhir audit אחרון)`,
        }
    }
    return {
        value: null,
        source: 'no_data',
        evidence: [],
        rationale: 'אין ציון בריאות מעקב זמין — דרוש Mazhir audit עדכני',
    }
}

async function routeAdapter(
    task: MonthlyTask,
    instanceId: string,
    rd: any,
): Promise<AdapterResult> {
    if (task.completedMethod === 'manual' && !task.actualImpact) {
        // Manual tasks where founder didn't fill the popup — surface to next plan
        // as "no data, manual not annotated" rather than running an automated pull
        // that won't make sense.
        return {
            value: null,
            source: 'no_data',
            evidence: [],
            rationale: 'משימה ידנית — המשתמש לא מילא את הפופאפ "מה יצא?". מסומן כלא נמדד.',
        }
    }
    if (task.channel === 'google_ads' || task.channel === 'meta') {
        return attributePaid(task, instanceId, rd)
    }
    if (task.channel === 'seo' || task.channel === 'content') {
        return attributeSeo(task, instanceId, rd)
    }
    if (task.type === 'measurement_gap' || task.type === 'tracking_setup') {
        return attributeMeasurementGap(task, instanceId, rd)
    }
    return {
        value: null,
        source: 'no_data',
        evidence: [],
        rationale: `אין מתאם מדידה אוטומטי עבור ערוץ=${task.channel} סוג=${task.type}`,
    }
}

// ─── Main scheduler ────────────────────────────────────────────────────────

export interface AttributionStats {
    agentsScanned: number
    tasksScanned: number
    tasksEligible: number
    tasksAttributed: number
    hits: number
    mixed: number
    missed: number
    unknown: number
    errors: number
}

export async function runTaskOutcomeAttribution(): Promise<AttributionStats> {
    const stats: AttributionStats = {
        agentsScanned: 0, tasksScanned: 0, tasksEligible: 0, tasksAttributed: 0,
        hits: 0, mixed: 0, missed: 0, unknown: 0, errors: 0,
    }
    const now = new Date()

    try {
        const rows = await db.select().from(matehAgents).where(isNotNull(matehAgents.researchData))
        for (const row of rows) {
            stats.agentsScanned++
            const rd: any = row.researchData || {}
            const tasks: MonthlyTask[] = rd?.monthlyPlan?.tasks
            if (!Array.isArray(tasks) || tasks.length === 0) continue

            const eligibleIndices: number[] = []
            for (let i = 0; i < tasks.length; i++) {
                stats.tasksScanned++
                if (isEligibleForAttribution(tasks[i], now)) eligibleIndices.push(i)
            }
            if (eligibleIndices.length === 0) continue
            stats.tasksEligible += eligibleIndices.length

            // Resolve adapters for each eligible task BEFORE writing — we want
            // a single mutateResearchData call per agent at the end.
            const updates: Array<{ idx: number; impact: NonNullable<MonthlyTask['actualImpact']> }> = []
            for (const idx of eligibleIndices) {
                const task = tasks[idx]
                try {
                    const adapter = await routeAdapter(task, row.vpsInstanceId, rd)
                    const expectedValue = Number(task.expectedImpact?.value) || 0
                    const actualValue = adapter.value
                    const realizedPct = (adapter.value != null && expectedValue !== 0)
                        ? (adapter.value / expectedValue) * 100
                        : undefined
                    const deltaVsExpected = (adapter.value != null && expectedValue !== 0)
                        ? ((adapter.value - expectedValue) / Math.abs(expectedValue)) * 100
                        : 0
                    const category = adapter.source === 'no_data' ? 'unknown' : categorize(realizedPct)

                    updates.push({
                        idx,
                        impact: {
                            metric: task.expectedImpact?.metric || 'other',
                            value: actualValue ?? 0,
                            horizon: task.expectedImpact?.horizon || '30d',
                            measuredAt: now.toISOString(),
                            rationale: adapter.rationale,
                            deltaVsExpected,
                            realizedPct,
                            category,
                            source: adapter.source,
                            evidence: adapter.evidence,
                        },
                    })
                    if (category === 'hit') stats.hits++
                    else if (category === 'mixed') stats.mixed++
                    else if (category === 'missed') stats.missed++
                    else stats.unknown++
                } catch (err) {
                    stats.errors++
                    console.error(`[taskOutcomeAttribution] task ${task.id} adapter error:`, (err as Error).message)
                }
            }

            if (updates.length === 0) continue
            try {
                const { mutateResearchData } = await import('@/services/agentContext')
                await mutateResearchData(row as MatehAgentRow, row.vpsInstanceId, (current: any) => {
                    const cur = current || {}
                    const curPlan = cur.monthlyPlan
                    if (!curPlan || !Array.isArray(curPlan.tasks)) return cur
                    const nextTasks = [...curPlan.tasks]
                    for (const u of updates) {
                        const t = nextTasks[u.idx]
                        if (!t || t.id !== tasks[u.idx].id) continue   // shifted under us → skip safely
                        nextTasks[u.idx] = { ...t, actualImpact: u.impact }
                    }
                    return { ...cur, monthlyPlan: { ...curPlan, tasks: nextTasks } }
                })
                stats.tasksAttributed += updates.length
                console.log(`[taskOutcomeAttribution] ${row.vpsInstanceId}/${row.id}: attributed ${updates.length} tasks`)

                // K18-b — alert on missed outcomes. One Telegram message per
                // agent (not per task) so 5 misses → 1 digest, not 5 pings.
                const missedThisAgent = updates.filter(u => u.impact.category === 'missed')
                if (missedThisAgent.length > 0) {
                    try {
                        const telegram = (await import('@/services/telegram')).default
                        const lines = missedThisAgent.slice(0, 5).map(u => {
                            const t = tasks[u.idx]
                            const expected = Number(t.expectedImpact?.value || 0)
                            const actual = Number(u.impact.value || 0)
                            const realized = u.impact.realizedPct?.toFixed(0) || '?'
                            return `• ${(t.title || '').slice(0, 60)} — צפי ${expected} / בפועל ${actual} (${realized}%)`
                        }).join('\n')
                        const more = missedThisAgent.length > 5 ? `\n_+ עוד ${missedThisAgent.length - 5} משימות שלא עמדו ביעד_` : ''
                        const msg = `📉 *${missedThisAgent.length} משימות לא עמדו ביעד* · ${row.vpsInstanceId}\n\n${lines}${more}\n\n_פתחו את הדאשבורד כדי להחליט: investigate / accept / replan_`
                        await telegram.alertAdmin(msg)
                    } catch (err) {
                        console.warn(`[taskOutcomeAttribution] miss alert failed for ${row.id}:`, (err as Error).message)
                    }
                }
            } catch (err) {
                stats.errors++
                console.error(`[taskOutcomeAttribution] persist failed for ${row.id}:`, (err as Error).message)
            }
        }
        console.log(`[taskOutcomeAttribution] done: ${JSON.stringify(stats)}`)
    } catch (err) {
        console.error('[taskOutcomeAttribution] top-level error:', err)
        stats.errors++
    }
    return stats
}