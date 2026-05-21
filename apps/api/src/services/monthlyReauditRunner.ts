/**
 * Monthly Re-audit Runner.
 *
 * On the 1st of each month (UTC), re-runs Mazhir audit for every instance
 * with active paid_search pipeline and an existing audit. The audit's diff
 * (computeAuditDiff) surfaces what changed:
 *   - methodology shift (STAG → STAG+PMax if budget grew + offline upload appeared)
 *   - blockers added/removed
 *   - tracking score moved
 *   - estimated conversions ±20%+
 *   - source coverage gained/lost
 *
 * Sends Telegram notification with summary if material changes detected.
 *
 * Schedule: hourly check; fires only when day-of-month=1 AND not already
 * fired this month (tracked via researchData.lastMonthlyReauditAt).
 *
 * Phase 4.3-E: after audit completes, also regenerate the unified monthly
 * marketing plan (services/monthlyPlanGenerator) for instances with
 * chosenScenario set. The plan picks up the fresh audit findings and
 * carries over still-pending tasks from the previous plan.
 */

import { eq, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'

export async function runMonthlyReaudits(): Promise<{
    eligible: number
    fired: number
    skippedAlreadyFired: number
    skippedNoPaid: number
    errors: number
    planFired: number
    planSkippedNoScenario: number
    planErrors: number
}> {
    const stats = { eligible: 0, fired: 0, skippedAlreadyFired: 0, skippedNoPaid: 0, errors: 0, planFired: 0, planSkippedNoScenario: 0, planErrors: 0 }

    const now = new Date()
    const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

    try {
        const rows = await db.select({
            id: instances.id,
            researchData: instances.researchData,
            status: instances.status,
        }).from(instances).where(isNotNull(instances.researchData))

        const { isPipelineEnabled } = await import('./pipelineActivation')

        for (const row of rows) {
            if (row.status !== 'running') continue
            const rd = (row.researchData as any) || {}
            if (!rd.mazhirAudit) continue
            stats.eligible++

            const enabled = await isPipelineEnabled(row.id, 'mazhir_audit')
            if (!enabled) {
                stats.skippedNoPaid++
                continue
            }

            // Skip if already ran this month
            if (rd.lastMonthlyReauditAt === currentMonthKey) {
                stats.skippedAlreadyFired++
                continue
            }

            try {
                // Phase 4.3-O M6: stamp lastMonthlyReauditAt BEFORE expensive work,
                // not after. If audit/plan crashes after this, next cron hour will
                // skip (better than re-fire + double DFS charges). Operator can
                // manually clear if a retry is genuinely needed.
                // Phase 4.3-O H7: use mutateResearchData (NOT raw db.update) per
                // feedback_research_data_dual_write — secondary agents on this VPS
                // need to see the stamp too.
                const { resolvePrimaryAgent, mutateResearchData } = await import('./agentContext')
                const agent = await resolvePrimaryAgent(row.id)
                await mutateResearchData(agent, row.id, (rd2: any) => {
                    rd2.lastMonthlyReauditAt = currentMonthKey
                    return rd2
                })

                // Phase 4.3-N v8 / 4.3-O H7: BEFORE re-audit, freeze the CURRENT baseline as the
                // previous-month reference (research_data.baselineHistory[month_key]).
                try {
                    const currentBaseline = rd?.results?.client_account_baseline
                    if (currentBaseline && currentBaseline.pulledAt) {
                        const prevMonth = new Date(now)
                        prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1)
                        const prevMonthKey = `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, '0')}`
                        await mutateResearchData(agent, row.id, (rd2: any) => {
                            const baselineHistory = rd2.baselineHistory || {}
                            if (!baselineHistory[prevMonthKey]) {
                                baselineHistory[prevMonthKey] = currentBaseline
                                rd2.baselineHistory = baselineHistory
                            }
                            return rd2
                        })
                        console.log(`[monthlyReauditRunner] ${row.id}: archived baseline as baselineHistory[${prevMonthKey}]`)
                    }
                } catch (e) {
                    console.warn(`[monthlyReauditRunner] ${row.id}: baseline archive failed (non-fatal):`, (e as Error).message)
                }

                // Re-pull baseline (current month) — without this the audit + plan see stale numbers.
                try {
                    const { prefetchClientAccountBaseline } = await import('@/controllers/hosting/research/stages/prefetch/client_account_baseline')
                    const newBaseline = await prefetchClientAccountBaseline(row.id, rd)
                    await mutateResearchData(agent, row.id, (rd2: any) => {
                        const results = rd2.results || {}
                        results.client_account_baseline = newBaseline
                        rd2.results = results
                        return rd2
                    })
                    console.log(`[monthlyReauditRunner] ${row.id}: baseline re-pulled + persisted for ${currentMonthKey}`)
                } catch (e) {
                    console.warn(`[monthlyReauditRunner] ${row.id}: baseline re-pull failed (non-fatal):`, (e as Error).message)
                }

                const { runMazhirAudit } = await import('./mazhirAudit')
                await runMazhirAudit(row.id)
                stats.fired++

                // Re-read for diff inspection below (audit + baseline writes happened in-loop)
                const updated = (await db.select({ researchData: instances.researchData })
                    .from(instances).where(eq(instances.id, row.id)))[0]
                const nextRd: any = updated?.researchData || {}

                // Notify if diff has material changes
                const diff = nextRd.mazhirAuditDiff
                if (diff && Array.isArray(diff.changes) && diff.changes.length > 0) {
                    try {
                        const telegram = (await import('./telegram')).default
                        const summary = `📊 אודיט חודשי חדש מוכן · ${diff.changes.length} שינויים · ${diff.summary || ''}`
                        await telegram.alertAdmin(`[${row.id}] ${summary}`)
                    } catch { /* best-effort */ }
                }

                // Phase 4.3-E: regenerate unified monthly plan now that audit is fresh.
                // Hard gates: chosenScenario must be set; paidProfile present (already
                // guaranteed by mazhirAudit existence). Per-instance failure isolated.
                if (nextRd.chosenScenario) {
                    try {
                        const { generateMonthlyPlan } = await import('./monthlyPlanGenerator')
                        // Phase 4.3-T: cron-monthly path operates on primary by design.
                        // Pass null explicitly so brandWhere() falls back via warning log.
                        const r = await generateMonthlyPlan(row.id, 'cron_monthly', null)
                        stats.planFired++
                        console.log(`[monthlyReauditRunner] ${row.id}: monthly plan refreshed (${r.monthlyPlan.summary.totalTasks} tasks)`)
                        // Notify on plan regenerate
                        try {
                            const telegram = (await import('./telegram')).default
                            const t = r.monthlyPlan
                            const msg = `📅 תוכנית חודשית חדשה · ${t.summary.totalTasks} משימות · P0=${t.summary.byPriority.P0}, P1=${t.summary.byPriority.P1}, P2=${t.summary.byPriority.P2}`
                            await telegram.alertAdmin(`[${row.id}] ${msg}`)
                        } catch { /* best-effort */ }
                    } catch (err) {
                        stats.planErrors++
                        console.error(`[monthlyReauditRunner] ${row.id} monthly plan failed:`, err)
                    }
                } else {
                    stats.planSkippedNoScenario++
                }
            } catch (err) {
                stats.errors++
                console.error(`[monthlyReauditRunner] ${row.id} failed:`, err)
            }
        }
        console.log(`[monthlyReauditRunner] ${currentMonthKey} ${JSON.stringify(stats)}`)
    } catch (err) {
        console.error('[monthlyReauditRunner] top-level:', err)
        stats.errors++
    }
    return stats
}

let started = false
export function startMonthlyReauditRunner(): void {
    if (started) return
    started = true
    const HOUR_MS = 60 * 60 * 1000
    console.log('[monthlyReauditRunner] starting (hourly check; fires only on day-1)')
    // Fire 30 minutes after boot to give DB connections time to settle
    setTimeout(() => {
        const isFirstOfMonth = new Date().getUTCDate() === 1
        if (isFirstOfMonth) runMonthlyReaudits().catch(() => { /* logged */ })
    }, 30 * 60 * 1000)
    setInterval(() => {
        const isFirstOfMonth = new Date().getUTCDate() === 1
        if (isFirstOfMonth) runMonthlyReaudits().catch(() => { /* logged */ })
    }, HOUR_MS)
}