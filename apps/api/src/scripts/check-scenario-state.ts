/** READ-ONLY: full chosenScenario + strategy_options scenario options + marketingIntents. */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const rd: any = a?.researchData || {}
    console.log('=== chosenScenario (full) ===')
    console.log(JSON.stringify(rd.chosenScenario, null, 1)?.slice(0, 700) || 'undefined')
    console.log('\n=== strategy_options.runAt ===', rd.results?.strategy_options?.runAt)
    const so = rd.results?.strategy_options || {}
    console.log('strategy_options keys:', Object.keys(so).join(','))
    const opts = so.extras?.scenarios || so.scenarios || so.records || so.extras?.options
    console.log('scenario options:', Array.isArray(opts) ? opts.map((o: any) => o?.key || o?.name || o?.scenario).join(' | ') : typeof opts)
    console.log('\n=== marketingIntents ===', JSON.stringify(rd.marketingIntents)?.slice(0, 300))
    console.log('\n=== plan staleness flags (plan.status wrappers) ===')
    console.log('chosenScenario stale?', JSON.stringify(rd.plan?.staleWrappers || rd.plan?.stale || rd._artifactFreshness)?.slice(0, 300))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })