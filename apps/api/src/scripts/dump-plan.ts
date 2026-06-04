/** READ-ONLY: dump a tenant's monthly plan — generatedAt + ordered tasks with
 * type/channel/priority + capability-registry verdict (auto/manual) + live status.
 *   node --env-file=.env --import tsx src/scripts/dump-plan.ts <agentId>
 */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { classifyTask, computePlanCoverage } from '@/services/executorCapabilities'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    if (!a) throw new Error(`agent ${agentId} not found`)
    const rd: any = a.researchData || {}
    const plan: any = rd.monthlyPlan
    if (!plan) { console.log('NO monthlyPlan in research_data'); process.exit(0) }
    const tasks: any[] = plan.tasks || []

    console.log(`\n=== Plan for ${a.name} (${agentId}) ===`)
    console.log(`  generatedAt: ${plan.generatedAt || '—'}`)
    console.log(`  month/period: ${plan.month || plan.period || '—'}`)
    console.log(`  meta: ${JSON.stringify(plan.metadata || plan.meta || {}).slice(0, 300)}`)
    console.log(`  tasks: ${tasks.length}`)

    // live statuses from agent_outputs
    const rows = await db.select().from(agentOutputs).where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'monthly_task')))
    const statusByTaskId: Record<string, string> = {}
    for (const r of rows) { const tid = (r.metadata as any)?.taskId; if (tid) statusByTaskId[tid] = r.status || '?' }

    console.log(`\n=== ordered tasks ===`)
    tasks.forEach((t: any, i: number) => {
        const { capabilityId, autonomy } = classifyTask(t)
        const wk = t.weekOfMonth ? `wk${t.weekOfMonth}` : (t.scheduledFor ? String(t.scheduledFor).slice(0, 10) : '—')
        const status = statusByTaskId[t.id] || '(no row)'
        const steps = (t.actionPlan || []).length
        console.log(`\n${String(i + 1).padStart(2)}. [${t.priority || '?'}] ${t.title}`)
        console.log(`     type=${t.type} · channel=${t.channel} · ${wk} · steps=${steps} · dependsOn=${JSON.stringify(t.dependsOn || [])}`)
        console.log(`     registry: ${autonomy.toUpperCase()} (${capabilityId}) · liveStatus=${status}`)
    })

    const cov = computePlanCoverage(tasks)
    console.log(`\n=== coverage (registry) ===`)
    console.log(`  total=${cov.total} · autoPct=${cov.autoPct}%`)
    console.log(`  byAutonomy: ${JSON.stringify(cov.byAutonomy)}`)
    console.log(`  byCapability: ${JSON.stringify(cov.byCapability)}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })