/**
 * Phase 4.3-N v8: monthly plan guardrails — extracted from monthlyPlanGenerator.
 *
 * Pure function that:
 *   1. Defaults missing fields (id, proposedAt, status, sources, dependsOn, actionPlan)
 *   2. Clamps priority to known enum
 *   3. Sorts tasks: P0→P1→P2, then by expectedImpact.value desc
 *   4. Distributes scheduledFor across the month (P0 days 1-14, P1 days 8-21,
 *      P2 days 15-28), skipping IL weekend (Fri+Sat)
 *   5. Computes summary statistics (byStatus / byPriority / byChannel / byType /
 *      estimatedTotalImpact)
 *
 * No logic change from v7 — purely a file move so v8's orchestrator can compose
 * it with the multi-pass output.
 */

import { randomBytes } from 'crypto'
import { isWorkDay } from './ilCalendar'
import type {
    MonthlyMarketingPlan,
    MonthlyTask,
    MonthlyPlanSummary,
} from '@/controllers/hosting/agentSetup'

export function applyMonthlyPlanGuardrails(plan: MonthlyMarketingPlan): MonthlyMarketingPlan {
    const fixedTasks: MonthlyTask[] = []
    const warnings: string[] = []

    for (const t of (plan.tasks || [])) {
        const fixed: MonthlyTask = { ...t }
        if (!fixed.id) fixed.id = 'tsk_' + randomBytes(5).toString('hex')
        if (!fixed.proposedAt) fixed.proposedAt = new Date().toISOString()
        if (!fixed.status) fixed.status = 'proposed'
        if (!Array.isArray(fixed.sources) || fixed.sources.length === 0) {
            warnings.push(`task "${(fixed.title || '').slice(0, 60)}" — no sources cited; flag for human review`)
            fixed.sources = [{ type: 'other', ref: 'missing', excerpt: '(no upstream evidence)' }]
        }
        if (!Array.isArray(fixed.dependsOn)) fixed.dependsOn = []
        if (!Array.isArray(fixed.actionPlan)) fixed.actionPlan = []
        if (!Array.isArray(fixed.childTaskIds)) fixed.childTaskIds = []
        if (!['P0', 'P1', 'P2'].includes(fixed.priority)) fixed.priority = 'P1'
        fixedTasks.push(fixed)
    }

    const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 }
    fixedTasks.sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 9
        const pb = priorityOrder[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        return (b.expectedImpact?.value || 0) - (a.expectedImpact?.value || 0)
    })

    const today = new Date()
    const baseY = today.getUTCFullYear()
    const baseM = today.getUTCMonth()
    const baseD = today.getUTCDate()
    function isoDate(year: number, month0: number, day: number): string {
        const d = new Date(Date.UTC(year, month0, day))
        return d.toISOString().slice(0, 10)
    }
    function nextWorkday(dayOffset: number): string {
        // K19: use ilCalendar.isWorkDay — knows Shabbat + Friday + Israeli
        // holidays 2026. Old impl only knew Fri/Sat → tasks could land on
        // Pesach / Rosh Hashana / Yom Kippur, instantly unactionable.
        let off = dayOffset
        for (let i = 0; i < 14; i++) {
            const iso = isoDate(baseY, baseM, baseD + off)
            if (isWorkDay(iso)) return iso
            off++
        }
        return isoDate(baseY, baseM, baseD + dayOffset)
    }

    const buckets: Record<string, { start: number; end: number; tasks: MonthlyTask[] }> = {
        P0: { start: 0, end: 13, tasks: [] },
        P1: { start: 7, end: 20, tasks: [] },
        P2: { start: 14, end: 27, tasks: [] },
    }
    for (const t of fixedTasks) {
        buckets[t.priority]?.tasks.push(t)
    }
    for (const key of ['P0', 'P1', 'P2'] as const) {
        const b = buckets[key]
        const span = b.end - b.start + 1
        b.tasks.forEach((t, idx) => {
            if (!t.scheduledFor) {
                const offset = b.start + Math.floor((idx * span) / Math.max(b.tasks.length, 1))
                t.scheduledFor = nextWorkday(offset)
            }
            if (!t.weekOfMonth) {
                const offset = Math.floor((new Date(t.scheduledFor).getTime() - Date.UTC(baseY, baseM, baseD)) / (24 * 3600 * 1000))
                t.weekOfMonth = Math.max(1, Math.min(4, Math.ceil((offset + 1) / 7))) as 1 | 2 | 3 | 4
            }
        })
    }

    const summary: MonthlyPlanSummary = {
        totalTasks: fixedTasks.length,
        byStatus: { proposed: fixedTasks.length, approved: 0, rejected: 0, skipped: 0, in_progress: 0, completed: 0, failed: 0 },
        byPriority: { P0: 0, P1: 0, P2: 0 },
        byChannel: {},
        byType: {},
        estimatedTotalImpact: {},
    }
    for (const t of fixedTasks) {
        summary.byPriority[t.priority] = (summary.byPriority[t.priority] || 0) + 1
        summary.byChannel[t.channel] = (summary.byChannel[t.channel] || 0) + 1
        summary.byType[t.type] = (summary.byType[t.type] || 0) + 1
        const ei = t.expectedImpact
        if (ei && ei.value > 0) {
            const inWindow = ei.horizon === '7d' || ei.horizon === '14d' || ei.horizon === '30d'
            if (!inWindow) continue
            switch (ei.metric) {
                case 'conversions':
                    summary.estimatedTotalImpact.extraConversions30d =
                        (summary.estimatedTotalImpact.extraConversions30d || 0) + ei.value
                    break
                case 'leads_per_month':
                    summary.estimatedTotalImpact.extraLeadsPerMonth =
                        (summary.estimatedTotalImpact.extraLeadsPerMonth || 0) + ei.value
                    break
                case 'spend_savings_ils':
                    summary.estimatedTotalImpact.spendSavingsIls30d =
                        (summary.estimatedTotalImpact.spendSavingsIls30d || 0) + ei.value
                    break
                case 'cpa_reduction_pct':
                    summary.estimatedTotalImpact.cpaReductionPct =
                        Math.max(summary.estimatedTotalImpact.cpaReductionPct || 0, ei.value)
                    break
                case 'organic_traffic_pct':
                    summary.estimatedTotalImpact.extraOrganicTraffic30d =
                        (summary.estimatedTotalImpact.extraOrganicTraffic30d || 0) + ei.value
                    break
            }
        }
    }

    plan.tasks = fixedTasks
    plan.summary = summary
    plan.qualityWarnings = [...(plan.qualityWarnings || []), ...warnings]
    return plan
}