/**
 * Plan-readability backfill — makes an EXISTING monthly plan readable Hebrew:
 * strips machine tokens (deterministic) + translates English prose (LLM), on
 * BOTH stores the cabinet reads from:
 *   1. research_data.monthlyPlan.tasks[]  — what the calendar/task modal renders
 *      (mateh_agents.research_data per agent, OR instances.research_data when the
 *      tenant is agentless, e.g. flow).
 *   2. agent_outputs rows (outputType='monthly_task') — the משימות פעילות queue,
 *      via runSavedPlanHebrewCleanup (already wired to the same sanitizer).
 *
 * Usage on prod:
 *   cd /opt/openclaw-hosting/apps/api
 *   pnpm tsx -e 'import "dotenv/config"; import("./src/scripts/backfill-plan-readability.ts")' <instanceId>
 *
 * Idempotent: deterministic floor is pure; LLM pass returns unchanged tasks when
 * already clean. Per-batch failures keep originals (never drops tasks).
 */

import 'dotenv/config'
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runMonthlyPlanHebrewCleanup } from '@/services/monthlyPlanHebrewCleanup'
import { sanitizeTasksInPlace, residualEnglishWords } from '@/services/monthlyPlanTextSanitizer'
import { runSavedPlanHebrewCleanup } from '@/services/monthlyPlanCleanupSaved'
import { mutateResearchData, type MatehAgentRow } from '@/services/agentContext'

const CHUNK_SIZE = 3

function collectResidual(tasks: Array<Record<string, any>>): string[] {
    const set = new Set<string>()
    for (const t of tasks) {
        const fields: string[] = [t.title, t.summary, t?.expectedImpact?.rationale]
        for (const s of Array.isArray(t.sources) ? t.sources.map((x: any) => x?.excerpt) : []) fields.push(s)
        for (const s of Array.isArray(t.actionPlan) ? t.actionPlan.map((x: any) => x?.step) : []) fields.push(s)
        for (const f of fields) for (const w of residualEnglishWords(typeof f === 'string' ? f : '')) set.add(w)
    }
    return Array.from(set).slice(0, 30)
}

// Clean research_data.monthlyPlan.tasks for one scope (agent row, or null=agentless).
async function cleanResearchData(agent: MatehAgentRow | null, instanceId: string): Promise<string> {
    const rdAny: any = agent ? (agent.researchData || {}) : null
    let tasks: any[] | undefined = rdAny?.monthlyPlan?.tasks
    if (!agent) {
        // agentless — read instances.research_data via a no-op mutate read
        const { instances } = await import('@/db/schema')
        const [inst] = await db.select({ rd: instances.researchData }).from(instances).where(eq(instances.id, instanceId))
        tasks = (inst?.rd as any)?.monthlyPlan?.tasks
    }
    if (!Array.isArray(tasks) || tasks.length === 0) return 'no research_data.monthlyPlan.tasks'

    const before = collectResidual(tasks)

    // LLM cleanup (chunked) — translates English prose.
    const cleanedAll: any[] = []
    let cleanedBatches = 0, keptBatches = 0
    for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
        const batch = tasks.slice(i, i + CHUNK_SIZE)
        const r = await runMonthlyPlanHebrewCleanup({ tasks: batch, instanceId })
        if (r.applied && r.cleanedTasks && r.cleanedTasks.length === batch.length) { cleanedAll.push(...r.cleanedTasks); cleanedBatches++ }
        else { cleanedAll.push(...batch); keptBatches++ }
    }

    // Deterministic floor — ALWAYS (guaranteed machine-token removal).
    const nSan = sanitizeTasksInPlace(cleanedAll)
    const after = collectResidual(cleanedAll)

    await mutateResearchData(agent, instanceId, (cur: any) => {
        const c = cur || {}
        return { ...c, monthlyPlan: { ...(c.monthlyPlan || {}), tasks: cleanedAll } }
    })

    return `${tasks.length} tasks · LLM ${cleanedBatches} clean/${keptBatches} kept · sanitizer touched ${nSan} · residual-English ${before.length}→${after.length}${after.length ? ` [${after.join(', ')}]` : ''}`
}

async function main(): Promise<void> {
    const args = process.argv.slice(2)
    const instanceId = args.find(a => !a.startsWith('--'))
    const agentFilter = args.find(a => a.startsWith('--agent='))?.split('=')[1] || null
    if (!instanceId) { console.error('usage: backfill-plan-readability <instanceId> [--agent=<agentId>]'); process.exit(1) }

    console.log(`\n=== plan-readability backfill — instance ${instanceId}${agentFilter ? ` agent ${agentFilter}` : ''} ===\n`)

    let agents = await db.select().from(matehAgents).where(eq(matehAgents.vpsInstanceId, instanceId)) as unknown as MatehAgentRow[]
    if (agentFilter) agents = agents.filter(a => a.id === agentFilter)

    // ── research_data.monthlyPlan.tasks (modal display) ──
    if (agents.length > 0) {
        for (const agent of agents) {
            try {
                const msg = await cleanResearchData(agent, instanceId)
                console.log(`[research_data] agent=${agent.id}${(agent as any).isPrimary ? ' (primary)' : ''}: ${msg}`)
            } catch (e) { console.error(`[research_data] agent=${agent.id}: FAILED — ${(e as Error).message}`) }
        }
    } else {
        try {
            const msg = await cleanResearchData(null, instanceId)
            console.log(`[research_data] agentless: ${msg}`)
        } catch (e) { console.error(`[research_data] agentless: FAILED — ${(e as Error).message}`) }
    }

    // ── agent_outputs monthly_task rows (active-tasks queue) ──
    try {
        const primaryAgentId = agents.find(a => (a as any).isPrimary)?.id ?? agents[0]?.id ?? null
        const r = await runSavedPlanHebrewCleanup(primaryAgentId, { instanceId })
        console.log(`[agent_outputs] ${r.status} — updated ${r.updated || 0}/${r.scanned || 0} rows`)
    } catch (e) { console.error(`[agent_outputs] FAILED — ${(e as Error).message}`) }

    console.log(`\n=== done ===\n`)
    process.exit(0)
}

main().catch((err) => { console.error('Backfill crashed:', err); process.exit(1) })