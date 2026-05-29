/**
 * K17 backfill — runs Hebrew cleanup pass on already-persisted monthly plan
 * tasks. Targets the `research_data.monthlyPlan.tasks[]` array stored per
 * agent on `mateh_agents` (canonical) and dual-writes the mirror on
 * `instances.research_data` for the primary agent.
 *
 * Usage on prod:
 *   cd /opt/openclaw-hosting/apps/api
 *   pnpm tsx -e 'import "dotenv/config"; import("./src/scripts/backfill-monthly-plan-hebrew-cleanup.ts")' --all
 *   pnpm tsx -e 'import "dotenv/config"; import("./src/scripts/backfill-monthly-plan-hebrew-cleanup.ts")' <instanceId>
 *
 * --all       process every mateh_agents row that has a monthlyPlan.tasks[]
 * <instanceId>  process only one instance (all agents on it)
 *
 * Idempotent — Sonnet cleanup pass returns unchanged tasks if already clean.
 * Each agent runs sequentially to avoid hammering Anthropic API; per-agent
 * failures are isolated + logged, others keep going.
 */

import 'dotenv/config'
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runMonthlyPlanHebrewCleanup } from '@/services/monthlyPlanHebrewCleanup'
import { mutateResearchData, type MatehAgentRow } from '@/services/agentContext'

interface AgentRow {
    id: string
    vpsInstanceId: string
    isPrimary: boolean
    researchData: any
}

async function processAgent(row: AgentRow): Promise<{ status: 'cleaned' | 'skipped' | 'failed'; reason?: string; taskCount?: number }> {
    const rd = row.researchData || {}
    const tasks = rd?.monthlyPlan?.tasks
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return { status: 'skipped', reason: 'no monthlyPlan.tasks' }
    }
    const cleanup = await runMonthlyPlanHebrewCleanup({
        tasks: tasks as Array<Record<string, unknown>>,
        instanceId: row.vpsInstanceId,
    })
    if (!cleanup.applied || !cleanup.cleanedTasks) {
        return { status: 'skipped', reason: cleanup.reason || 'cleanup not applied', taskCount: tasks.length }
    }
    // Persist via mutateResearchData — reads fresh from DB, merges cleaned
    // tasks, dual-writes mateh_agents + instances (when primary). Honors
    // feedback_research_data_dual_write — raw db.update on research_data gets
    // silently overwritten by the next patchResearchData call elsewhere.
    await mutateResearchData(row as unknown as MatehAgentRow, row.vpsInstanceId, (current: any) => {
        const cur = current || {}
        const curPlan = cur.monthlyPlan || {}
        return { ...cur, monthlyPlan: { ...curPlan, tasks: cleanup.cleanedTasks } }
    })

    return { status: 'cleaned', taskCount: cleanup.cleanedTasks.length }
}

async function main(): Promise<void> {
    const args = process.argv.slice(2)
    const all = args.includes('--all')
    const instanceArg = args.find(a => !a.startsWith('--'))

    console.log(`\n=== K17 backfill — monthly plan Hebrew cleanup ===`)
    console.log(`mode: ${all ? 'all instances' : `instance ${instanceArg || '(none specified — defaulting to --all)'}`}\n`)

    let rows: AgentRow[] = []
    if (instanceArg) {
        const r = await db.select({
            id: matehAgents.id,
            vpsInstanceId: matehAgents.vpsInstanceId,
            isPrimary: matehAgents.isPrimary,
            researchData: matehAgents.researchData,
        }).from(matehAgents).where(eq(matehAgents.vpsInstanceId, instanceArg))
        rows = r as AgentRow[]
    } else {
        const r = await db.select({
            id: matehAgents.id,
            vpsInstanceId: matehAgents.vpsInstanceId,
            isPrimary: matehAgents.isPrimary,
            researchData: matehAgents.researchData,
        }).from(matehAgents)
        rows = r as AgentRow[]
    }

    console.log(`agents to scan: ${rows.length}\n`)

    const stats = { cleaned: 0, skipped: 0, failed: 0 }
    let i = 0
    for (const row of rows) {
        i++
        const label = `[${i}/${rows.length}] instance=${row.vpsInstanceId} agent=${row.id}${row.isPrimary ? ' (primary)' : ''}`
        try {
            const r = await processAgent(row)
            stats[r.status]++
            const suffix = r.status === 'cleaned' ? ` — ${r.taskCount} tasks cleaned` :
                           r.status === 'skipped' ? ` — ${r.reason}` :
                           ` — ${r.reason}`
            console.log(`${label}: ${r.status.toUpperCase()}${suffix}`)
        } catch (err) {
            stats.failed++
            console.error(`${label}: FAILED — ${(err as Error).message}`)
        }
    }

    console.log(`\n=== done — cleaned=${stats.cleaned} skipped=${stats.skipped} failed=${stats.failed} ===\n`)
    process.exit(0)
}

main().catch((err) => {
    console.error('Backfill crashed:', err)
    process.exit(1)
})