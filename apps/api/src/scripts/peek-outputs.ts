/** READ-ONLY: find the new plan row + show storage shape. */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'

async function main() {
    // by known id
    const byId = await db.select().from(agentOutputs).where(eq(agentOutputs.id, 'mp_month_a62fa4b60ddd'))
    console.log('byId rows:', byId.length)
    if (byId[0]) {
        const r: any = byId[0]
        console.log('  keys:', Object.keys(r).join(','))
        console.log('  outputType:', r.outputType, '| agentId:', r.agentId, '| instanceId:', r.instanceId, '| status:', r.status, '| created:', r.createdAt)
        const payloadKey = r.payload ? 'payload' : (r.content ? 'content' : (r.data ? 'data' : '?'))
        console.log('  payloadKey:', payloadKey)
        const pl: any = r.payload || r.content || r.data || {}
        const plan = pl.monthlyPlan || pl
        console.log('  plan keys:', Object.keys(plan).join(','), '| tasks:', (plan.tasks || []).length)
    }
    console.log('\nrecent monthly_plan rows:')
    const recent = await db.select().from(agentOutputs).where(eq(agentOutputs.outputType, 'monthly_plan')).orderBy(desc(agentOutputs.createdAt)).limit(5)
    for (const r of recent as any[]) console.log(`  ${r.id} agentId=${r.agentId} created=${r.createdAt} status=${r.status}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })