/** Clear the STORED cascade-stale flags the UI reads:
 *  research_data.plan.status[*].stale + research_data._artifactFreshness[*].stale.
 *  Safe here: the accidental strategy_options re-run used identical inputs, so the
 *  downstream stage/wrapper outputs are still valid — no re-run needed. */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { readResearchData, writeResearchData } from '@/services/agentContext'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const instanceId = agent.vpsInstanceId
    const rd: any = await readResearchData(agent, instanceId)
    let cleared = 0
    const st = rd.plan?.status || {}
    for (const k of Object.keys(st)) { if (st[k]?.stale) { delete st[k].stale; cleared++; console.log('  cleared plan.status.' + k + '.stale') } }
    const fr = rd._artifactFreshness || {}
    for (const k of Object.keys(fr)) { if (fr[k]?.stale) { delete fr[k].stale; cleared++; console.log('  cleared _artifactFreshness.' + k + '.stale') } }
    await writeResearchData(agent, instanceId, rd)
    console.log(`total stale flags cleared: ${cleared}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })