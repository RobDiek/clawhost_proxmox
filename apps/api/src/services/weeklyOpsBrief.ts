/**
 * Weekly Ops Brief cron.
 *
 * For each instance that has committed a chosenScenario (MATEH onboarded
 * past strategy step), regenerates the Weekly Ops Brief once per week.
 * The brief is:
 *   1. persisted to researchData.opsBriefs[] + latestOpsBrief
 *   2. ingested as a pending_review row in agent_outputs — so it appears
 *      in the Home → משימות פעילות (approval queue) exactly like a
 *      content draft or a weekly creative report.
 *
 * Both paths — this cron and the manual "ייצרו דוח ראשון" button —
 * call the same helper `runOpsBriefForInstance`, so behavior is identical.
 *
 * Schedule: first run 90 min after boot, then every 7 days.
 * Cost: ~$0.06/instance/week (Claude Sonnet, ~3k tokens).
 */
import { eq, isNotNull } from 'drizzle-orm'

import { db } from '@/db'
import { instances } from '@/db/schema'
import { runOpsBriefForInstance } from '@/controllers/hosting/agentSetup'

export async function runWeeklyOpsBriefs(): Promise<{
    eligible: number
    generated: number
    skipped: number
    errors: number
}> {
    const stats = { eligible: 0, generated: 0, skipped: 0, errors: 0 }

    try {
        // Pull all running instances with research data. We filter in-memory
        // because researchData.chosenScenario is nested JSON — not cheap to
        // query with a WHERE clause.
        const rows = await db.select({
            id: instances.id,
            researchData: instances.researchData,
            status: instances.status,
        }).from(instances).where(isNotNull(instances.researchData))

        for (const row of rows) {
            if (row.status !== 'running') continue
            const rd = (row.researchData as any) || {}
            if (!rd.chosenScenario) continue
            stats.eligible++
            try {
                const r = await runOpsBriefForInstance(row.id)
                if (r.ok) stats.generated++
                else {
                    stats.skipped++
                    console.warn(`[weeklyOpsBrief] ${row.id} skipped: ${r.reason}`)
                }
            } catch (err) {
                stats.errors++
                console.error(`[weeklyOpsBrief] ${row.id} failed:`, err)
            }
        }
        console.log(`[weeklyOpsBrief] ${JSON.stringify(stats)}`)
    } catch (err) {
        console.error('[weeklyOpsBrief] top-level error:', err)
        stats.errors++
    }
    return stats
}

let started = false
export function startWeeklyOpsBrief(): void {
    if (started) return
    started = true
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000
    console.log(`[weeklyOpsBrief] starting (weekly; first run in 90min)`)
    setTimeout(() => { runWeeklyOpsBriefs().catch(() => { /* logged inside */ }) }, 90 * 60 * 1000)
    setInterval(() => { runWeeklyOpsBriefs().catch(() => { /* logged inside */ }) }, WEEK_MS)
}