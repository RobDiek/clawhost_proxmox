/**
 * K20 — Failed Task Retry Runner
 *
 * Periodic cron (every 30 min) that scans research_data.monthlyPlan.tasks[]
 * across all mateh_agents for tasks where:
 *
 *   status === 'failed'
 *   AND retryCount   <  3
 *   AND nextRetryAt  <= now
 *
 * Re-fires each eligible task through monthlyTaskExecutor. The executor's
 * existing catch block (services/monthlyTaskExecutor.ts) handles the rest:
 *   · on success → status='completed', K18 attribution cron will measure
 *   · on failure → retryCount++, exponential backoff updated, OR final
 *     failure spawns an investigate child task + sends an alert
 *
 * Honors feedback_research_data_dual_write — all writes flow through the
 * existing executor path which uses mutateResearchData.
 */

import { isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import type { MonthlyTask } from '@/controllers/hosting/agentSetup'

const MAX_RETRIES = 3

export interface RetryRunnerStats {
    agentsScanned: number
    tasksScanned: number
    tasksEligible: number
    tasksRetried: number
    successes: number
    failures: number
    errors: number
}

export async function runFailedTaskRetry(): Promise<RetryRunnerStats> {
    const stats: RetryRunnerStats = {
        agentsScanned: 0, tasksScanned: 0, tasksEligible: 0,
        tasksRetried: 0, successes: 0, failures: 0, errors: 0,
    }
    const nowMs = Date.now()

    try {
        const rows = await db.select().from(matehAgents).where(isNotNull(matehAgents.researchData))
        for (const row of rows) {
            stats.agentsScanned++
            const rd: any = row.researchData || {}
            const tasks: MonthlyTask[] = rd?.monthlyPlan?.tasks
            if (!Array.isArray(tasks) || tasks.length === 0) continue

            for (const task of tasks) {
                stats.tasksScanned++
                const tAny = task as any
                if (task.status !== 'failed') continue
                if ((tAny.retryCount || 0) >= MAX_RETRIES) continue
                if (!tAny.nextRetryAt) continue
                const nextAt = new Date(tAny.nextRetryAt).getTime()
                if (Number.isNaN(nextAt) || nextAt > nowMs) continue
                stats.tasksEligible++

                try {
                    const { executeTask } = await import('./monthlyTaskExecutor')
                    const result = await executeTask(row.vpsInstanceId, task.id, row.id)
                    stats.tasksRetried++
                    if (result?.ok) stats.successes++
                    else stats.failures++
                } catch (err) {
                    stats.errors++
                    console.error(`[failedTaskRetryRunner] retry failed for ${task.id}:`, (err as Error).message)
                }
            }
        }
        console.log(`[failedTaskRetryRunner] done: ${JSON.stringify(stats)}`)
    } catch (err) {
        console.error('[failedTaskRetryRunner] top-level error:', err)
        stats.errors++
    }
    return stats
}