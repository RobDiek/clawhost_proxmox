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

// Chunked cleanup — the cleanup pass wraps the entire task list in one
// Anthropic call. With 8+ verbose tasks the Sonnet response takes >5 min →
// undici default headersTimeout (300s) fires and reports "fetch failed".
// 3 tasks per batch completes in <60s. 58 tasks → ~20 batches → ~15 min total.
const CHUNK_SIZE = 3

async function processAgent(row: AgentRow): Promise<{ status: 'cleaned' | 'skipped' | 'failed'; reason?: string; taskCount?: number }> {
    const rd = row.researchData || {}
    const tasks = rd?.monthlyPlan?.tasks
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return { status: 'skipped', reason: 'no monthlyPlan.tasks' }
    }

    const cleanedAll: Array<Record<string, unknown>> = []
    let cleanedBatches = 0
    let skippedBatches = 0
    for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
        const batch = tasks.slice(i, i + CHUNK_SIZE) as Array<Record<string, unknown>>
        const cleanup = await runMonthlyPlanHebrewCleanup({
            tasks: batch,
            instanceId: row.vpsInstanceId,
        })
        if (cleanup.applied && cleanup.cleanedTasks && cleanup.cleanedTasks.length === batch.length) {
            cleanedAll.push(...cleanup.cleanedTasks)
            cleanedBatches++
        } else {
            // Preserve the originals untouched — never drop tasks because cleanup
            // failed on a single batch.
            cleanedAll.push(...batch)
            skippedBatches++
            console.warn(`  ↳ batch ${Math.floor(i / CHUNK_SIZE) + 1} kept as-is: ${cleanup.reason || 'unknown'}`)
        }
    }

    if (cleanedBatches === 0) {
        return { status: 'skipped', reason: `all ${skippedBatches} batches skipped`, taskCount: tasks.length }
    }

    // Persist via mutateResearchData — reads fresh from DB, merges cleaned
    // tasks, dual-writes mateh_agents + instances (when primary). Honors
    // feedback_research_data_dual_write — raw db.update on research_data gets
    // silently overwritten by the next patchResearchData call elsewhere.
    await mutateResearchData(row as unknown as MatehAgentRow, row.vpsInstanceId, (current: any) => {
        const cur = current || {}
        const curPlan = cur.monthlyPlan || {}
        return { ...cur, monthlyPlan: { ...curPlan, tasks: cleanedAll } }
    })

    return { status: 'cleaned', taskCount: cleanedAll.length, reason: `${cleanedBatches} batches cleaned, ${skippedBatches} kept as-is` }
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
            const suffix = r.status === 'cleaned' ? ` — ${r.taskCount} tasks (${r.reason})` :
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