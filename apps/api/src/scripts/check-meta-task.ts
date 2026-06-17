/** READ-ONLY: all meta-description monthly_task rows + the current one's status. */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'monthly_task'))) as any[]
    const metas = rows.filter(r => /meta description|תיאורי מטא|meta desc/i.test(r.title || ''))
    console.log(`meta-description tasks: ${metas.length}`)
    for (const r of metas) {
        const md: any = r.metadata || {}
        console.log(`  id=${r.id} status=${r.status} gen=${md.monthlyPlanGeneratedAt} taskId=${md.taskId} created=${r.createdAt} updated=${r.updatedAt}`)
    }
    // rd.monthlyPlan task status
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const t = (a?.researchData?.monthlyPlan?.tasks || []).find((x: any) => /meta description|תיאורי מטא/i.test(x.title || ''))
    if (t) console.log(`\nrd.monthlyPlan meta task: id=${t.id} status=${t.status} executionOutputId=${t.executionOutputId || '-'}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })