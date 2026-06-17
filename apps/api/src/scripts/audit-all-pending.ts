/** READ-ONLY: EXACTLY what the kabinet fetches — all pending_review outputs (any type). */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq, desc } from 'drizzle-orm'
async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const agentId = process.argv[3] || 'mta_Un9jXRuf'
    // mirror getOutputs: status=pending_review, agent filter, limit 100, newest first
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.instanceId, instanceId), eq(agentOutputs.agentId, agentId), eq(agentOutputs.status, 'pending_review')))
        .orderBy(desc(agentOutputs.createdAt)).limit(100) as any[]
    console.log(`pending_review (agent ${agentId}): ${rows.length}`)
    const byType: Record<string, number> = {}
    for (const r of rows) byType[r.outputType] = (byType[r.outputType] || 0) + 1
    console.log('by outputType:', JSON.stringify(byType))
    console.log('\n=== first 10 (newest first = what kabinet shows top) ===')
    for (const r of rows.slice(0, 10)) {
        const md: any = r.metadata || {}
        console.log(`  [${r.outputType}] gen=${md.monthlyPlanGeneratedAt || '-'} sched=${md.scheduledFor || '-'} created=${r.createdAt} "${(r.title || '').slice(0, 60)}"`)
    }
    console.log('\n=== any ROAS-400 / old-worded among pending (any type) ===')
    for (const r of rows) {
        if (/ROAS 400|ארגון וסידור|רשת החיפוש -|Pmax - Packing/i.test(r.title || '')) {
            const md: any = r.metadata || {}
            console.log(`  [${r.outputType}] gen=${md.monthlyPlanGeneratedAt} created=${r.createdAt} "${r.title}"`)
        }
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })