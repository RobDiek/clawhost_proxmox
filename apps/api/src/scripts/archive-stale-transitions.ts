/** Archive stale pending imported_objective_transition proposals (premature tROAS,
 * superseded by the staged monthly plan). DB-only status flip; touches no Ads.
 *   node --env-file=.env --import tsx src/scripts/archive-stale-transitions.ts <agentId> [--apply]
 */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const apply = process.argv.includes('--apply')
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'imported_objective_transition'), eq(agentOutputs.status, 'pending_review'))) as any[]
    console.log(`stale pending imported_objective_transition: ${rows.length}`)
    for (const r of rows) console.log(`  ${r.id} created=${r.createdAt} "${(r.title || '').slice(0, 70)}"`)
    if (apply) {
        for (const r of rows) await db.update(agentOutputs).set({ status: 'archived', updatedAt: new Date() }).where(eq(agentOutputs.id, r.id))
        console.log(`\n✅ archived ${rows.length} stale transition proposals`)
    } else {
        console.log('\n(dry-run — pass --apply to archive)')
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })