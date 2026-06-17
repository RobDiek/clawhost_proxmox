/** Pre-re-run cleanup: archive dupe-prone strategy outputs for one Mateh agent.
 *  Dry by default; pass --apply to archive. Preserves reports + seoTracking + research_data. */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq, inArray, ne } from 'drizzle-orm'

// Outputs the research/strategy re-run REGENERATES → archive to avoid duplicates.
const ARCHIVE_TYPES = [
    'monthly_task', 'monthly_marketing_plan', 'ads_recommendations_review',
    'imported_objective_transition', 'content_plan', 'media_plan', 'strategy_brief',
]
// Explicitly PRESERVED (historical / live state): weekly_*, monthly_report_card, etc.

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const apply = process.argv.includes('--apply')
    const rows = await db.select().from(agentOutputs).where(eq(agentOutputs.agentId, agentId)) as any[]

    const byType: Record<string, Record<string, number>> = {}
    for (const r of rows) {
        const t = r.outputType || '?'; const s = r.status || '?'
        byType[t] = byType[t] || {}; byType[t][s] = (byType[t][s] || 0) + 1
    }
    console.log(`agent ${agentId}: ${rows.length} agent_outputs`)
    for (const t of Object.keys(byType).sort()) {
        const mark = ARCHIVE_TYPES.includes(t) ? ' → ARCHIVE' : ' (keep)'
        console.log(`  ${t}: ${JSON.stringify(byType[t])}${mark}`)
    }

    const toArchive = rows.filter(r => ARCHIVE_TYPES.includes(r.outputType) && r.status !== 'archived')
    console.log(`\n${apply ? 'ARCHIVING' : 'WOULD ARCHIVE'} ${toArchive.length} rows (status != archived) of types: ${ARCHIVE_TYPES.join(', ')}`)
    if (apply && toArchive.length) {
        await db.update(agentOutputs)
            .set({ status: 'archived' })
            .where(and(eq(agentOutputs.agentId, agentId), inArray(agentOutputs.outputType, ARCHIVE_TYPES), ne(agentOutputs.status, 'archived')))
        console.log('done — archived.')
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })