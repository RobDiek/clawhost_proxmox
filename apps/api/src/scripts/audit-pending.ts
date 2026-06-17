/** READ-ONLY: why are stale ROAS tasks pending? Group monthly_task rows by gen + status. */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'monthly_task'))) as any[]
    console.log(`total monthly_task rows: ${rows.length}`)
    const byGenStatus: Record<string, number> = {}
    for (const r of rows) {
        const gen = (r.metadata as any)?.monthlyPlanGeneratedAt || 'NO_GEN'
        const key = `${gen} | ${r.status}`
        byGenStatus[key] = (byGenStatus[key] || 0) + 1
    }
    console.log('\n=== by (generatedAt | status) ===')
    for (const k of Object.keys(byGenStatus).sort()) console.log(`  ${k}: ${byGenStatus[k]}`)

    console.log('\n=== ROAS 400% tasks (the ones shown pending) ===')
    for (const r of rows) {
        if (/ROAS 400%|ROAS\s*400|יעד.*roas/i.test(r.title || '')) {
            const md: any = r.metadata || {}
            console.log(`  status=${r.status} gen=${md.monthlyPlanGeneratedAt} sched=${md.scheduledFor} id=${md.taskId} "${r.title}"`)
        }
    }

    console.log('\n=== pending_review rows: gen + scheduledFor sample ===')
    const pend = rows.filter(r => r.status === 'pending_review')
    console.log(`pending_review count: ${pend.length}`)
    const pByGen: Record<string, number> = {}
    for (const r of pend) { const g = (r.metadata as any)?.monthlyPlanGeneratedAt || 'NO_GEN'; pByGen[g] = (pByGen[g] || 0) + 1 }
    for (const k of Object.keys(pByGen).sort()) console.log(`  gen ${k}: ${pByGen[k]} pending`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })