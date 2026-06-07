/** READ-ONLY: full inventory of an agent's monthlyPlan tasks for the per-task
 * re-run effort. Joins plan tasks (research_data) with their monthly_task
 * agent_output rows (status / errorCategory / agentReview verdict / output desc)
 * and the systemic classifier (classifyTask). No writes.
 *
 *   node --env-file=.env --import tsx src/scripts/inventory-plan.ts [agentId]
 */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { classifyTask, classifyTaskMulti } from '@/services/executorCapabilities'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const tasks: any[] = a?.researchData?.monthlyPlan?.tasks || []
    const genAt = a?.researchData?.monthlyPlan?.generatedAt || '?'

    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'monthly_task'))) as any[]
    const outByTask = new Map<string, any>()
    for (const r of rows) {
        const md: any = r.metadata || {}
        if (!md.taskId) continue
        // keep newest per taskId
        const prev = outByTask.get(md.taskId)
        if (!prev || new Date(r.createdAt) > new Date(prev._createdAt)) {
            let c: any = r.content; if (typeof c === 'string') { try { c = JSON.parse(c) } catch { c = {} } }
            outByTask.set(md.taskId, {
                _createdAt: r.createdAt, outStatus: r.status,
                errorCategory: md.errorCategory || c?.errorCategory,
                verdict: md.agentReview?.verdict,
                desc: String(c?.outputDescription || '').replace(/\s+/g, ' ').slice(0, 90),
            })
        }
    }

    console.log(`agent=${agentId} plan.generatedAt=${genAt} tasks=${tasks.length} monthly_task rows=${rows.length}\n`)

    // tally
    const byStatus: Record<string, number> = {}
    const byCap: Record<string, number> = {}
    const byAutonomy: Record<string, number> = {}
    const noopCats = new Set(['completed_idempotent_noop', 'not_implemented'])
    let noopCount = 0

    const fmt = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n)
    console.log(fmt('#', 3), fmt('status', 12), fmt('autonomy', 13), fmt('capability', 22), fmt('verdict', 14), fmt('out', 16), 'title')
    console.log('-'.repeat(140))
    tasks.forEach((t, i) => {
        const { capabilityId, autonomy } = classifyTask(t)
        const multi = classifyTaskMulti(t)
        const capLabel = multi.capabilities.length > 1 ? `${capabilityId}+${multi.capabilities.length - 1}` : capabilityId
        const o = outByTask.get(t.id) || {}
        byStatus[t.status] = (byStatus[t.status] || 0) + 1
        byCap[capabilityId] = (byCap[capabilityId] || 0) + 1
        byAutonomy[autonomy] = (byAutonomy[autonomy] || 0) + 1
        const isNoop = noopCats.has(o.errorCategory)
        if (isNoop) noopCount++
        console.log(
            fmt(String(i), 3),
            fmt(t.status || '?', 12),
            fmt(autonomy, 13),
            fmt(capLabel, 22),
            fmt(o.verdict || '-', 14),
            fmt((o.errorCategory || o.outStatus || '-'), 16) + (isNoop ? '*' : ' '),
            String(t.title || '').slice(0, 50),
        )
    })

    console.log('\n=== tallies ===')
    console.log('by status   :', JSON.stringify(byStatus))
    console.log('by autonomy :', JSON.stringify(byAutonomy))
    console.log('by capability:', JSON.stringify(byCap))
    console.log(`completed-noop (idempotent_noop / not_implemented): ${noopCount}  (marked * above)`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })