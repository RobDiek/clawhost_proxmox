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
}> {
    const stats = { eligible: 0, fired: 0, skippedAlreadyFired: 0, skippedNoPaid: 0, errors: 0 }

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
                const { runMazhirAudit } = await import('./mazhirAudit')
                await runMazhirAudit(row.id)
                stats.fired++

                // Stamp the month so we don't re-fire if cron retries
                const updated = (await db.select({ researchData: instances.researchData })
                    .from(instances).where(eq(instances.id, row.id)))[0]
                const nextRd: any = updated?.researchData || {}
                nextRd.lastMonthlyReauditAt = currentMonthKey
                await db.update(instances).set({ researchData: nextRd as any }).where(eq(instances.id, row.id))

                // Notify if diff has material changes
                const diff = nextRd.mazhirAuditDiff
                if (diff && Array.isArray(diff.changes) && diff.changes.length > 0) {
                    try {
                        const telegram = (await import('./telegram')).default
                        const summary = `📊 אודיט חודשי חדש מוכן · ${diff.changes.length} שינויים · ${diff.summary || ''}`
                        await telegram.alertAdmin(`[${row.id}] ${summary}`)
                    } catch { /* best-effort */ }
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