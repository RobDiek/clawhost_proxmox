/** Re-pick chosenScenario from the FRESH strategy_options + clear stale wrapper flags.
 *  Mirrors controllers/hosting/research/chooseScenario.ts + clears _artifactFreshness stale. */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { readResearchData, writeResearchData } from '@/services/agentContext'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const scenario = process.argv[3] || 'aggressive'
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const instanceId = agent.vpsInstanceId
    const rd: any = await readResearchData(agent, instanceId)
    const recs = rd.results?.strategy_options?.records || []
    const match = recs.find((r: any) => r.scenario === scenario)
    if (!match) { console.log(`no ${scenario} record in strategy_options (records: ${recs.map((r: any) => r.scenario).join(',')})`); process.exit(1) }

    rd.chosenScenario = { ...match, chosenByUser: true, chosenAt: new Date().toISOString(), _autoSelected: false }

    // clear stored stale markers for chosenScenario + marketingIntents wherever they live
    let cleared = 0
    for (const holder of [rd._artifactFreshness, rd.plan?.stale, rd.plan?.staleWrappers, rd.plan]) {
        if (!holder || typeof holder !== 'object') continue
        for (const k of ['chosenScenario', 'marketingIntents']) {
            if (holder[k]?.stale) { delete holder[k].stale; cleared++ }
        }
    }
    await writeResearchData(agent, instanceId, rd)
    console.log(`chosenScenario → ${scenario} (chosenAt ${rd.chosenScenario.chosenAt}); stale markers cleared: ${cleared}`)
    // show what was picked
    console.log('scenario KPIs:', JSON.stringify(match.kpis || match.month1 || match.targets || {}).slice(0, 200))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })