/** READ-ONLY: latest monthly_plan outputs for an agent (id, created, #tasks, theme). */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq, desc } from 'drizzle-orm'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'monthly_plan')))
        .orderBy(desc(agentOutputs.createdAt)).limit(3)
    for (const r of rows) {
        const p: any = (r as any).payload || (r as any).content || {}
        const plan = p.monthlyPlan || p
        const tasks = plan.tasks || []
        console.log(`id=${r.id} created=${(r as any).createdAt} status=${(r as any).status} tasks=${tasks.length} theme="${plan.keyTheme || plan.theme || '—'}"`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })