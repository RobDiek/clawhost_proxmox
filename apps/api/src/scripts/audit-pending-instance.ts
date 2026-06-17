/** READ-ONLY: ALL pending_review monthly_task rows on the instance, by agentId. */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.instanceId, instanceId), eq(agentOutputs.outputType, 'monthly_task'), eq(agentOutputs.status, 'pending_review'))) as any[]
    console.log(`pending_review monthly_task on ${instanceId}: ${rows.length}`)
    const byAgent: Record<string, number> = {}
    for (const r of rows) { const a = r.agentId || 'NULL'; byAgent[a] = (byAgent[a] || 0) + 1 }
    console.log('by agentId:', JSON.stringify(byAgent, null, 2))
    console.log('\n=== ROAS 400% pending (any agent) ===')
    for (const r of rows) {
        if (/ROAS 400%|ROAS\s*400|יעד.*roas|tROAS/i.test(r.title || '')) {
            const md: any = r.metadata || {}
            console.log(`  agent=${r.agentId} gen=${md.monthlyPlanGeneratedAt} sched=${md.scheduledFor} "${r.title}"`)
        }
    }
    // also: ALL statuses for ROAS across the instance (to see where the screenshot ones live)
    const all = await db.select().from(agentOutputs).where(and(eq(agentOutputs.instanceId, instanceId), eq(agentOutputs.outputType, 'monthly_task'))) as any[]
    console.log('\n=== ALL ROAS 400% rows (any status, any agent) ===')
    for (const r of all) {
        if (/ROAS 400%|ארגון וסידור|רשת החיפוש|Pmax/i.test(r.title || '') && /ROAS|roas/i.test(r.title || '')) {
            const md: any = r.metadata || {}
            console.log(`  status=${r.status} agent=${r.agentId} gen=${md.monthlyPlanGeneratedAt} "${(r.title || '').slice(0, 70)}"`)
        }
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })