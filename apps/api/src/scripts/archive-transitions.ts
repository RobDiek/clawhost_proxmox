/** Archive imported_objective_transition proposals (premature — based on pre-2026-06-04
 *  broken/contaminated conversions). They'll re-propose via cron; deeper fix = gate runner
 *  on clean-data window. */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq, ne } from 'drizzle-orm'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const before = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'imported_objective_transition'), ne(agentOutputs.status, 'archived'))) as any[]
    console.log(`archiving ${before.length} imported_objective_transition: ${before.map(r => String(r.title).slice(0, 40)).join(' | ')}`)
    await db.update(agentOutputs).set({ status: 'archived' })
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'imported_objective_transition'), ne(agentOutputs.status, 'archived')))
    console.log('done.')
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })