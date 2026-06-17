/** Undo the accidental redundant strategy_options re-run's timestamp bump:
 *  restore its runAt to the legitimate re-run time (18:14, before downstream
 *  stages ran) so computed staleness on all downstream wrappers clears at once.
 *  The 07:00 re-run used identical inputs → content is equivalent → safe. */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { readResearchData, writeResearchData } from '@/services/agentContext'

const RESTORE = '2026-06-06T18:14:08.781Z'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const instanceId = agent.vpsInstanceId
    const rd: any = await readResearchData(agent, instanceId)
    const before = { results: rd.results?.strategy_options?.runAt, status: rd.plan?.status?.strategy_options?.runAt }
    if (rd.results?.strategy_options) rd.results.strategy_options.runAt = RESTORE
    if (rd.plan?.status?.strategy_options) rd.plan.status.strategy_options.runAt = RESTORE
    await writeResearchData(agent, instanceId, rd)
    console.log('strategy_options.runAt restored:', JSON.stringify(before), '→', RESTORE)
    // sanity: list downstream stage runAts vs restored
    const ds = ['validation', 'content_plan', 'media_plan', 'positioning', 'cost_timeline_modeling']
    for (const s of ds) {
        const rt = rd.plan?.status?.[s]?.runAt || rd.results?.[s]?.runAt
        console.log(`  ${s}.runAt=${rt} ${rt && rt > RESTORE ? '(fresh ✓)' : '(still <= restore)'}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })