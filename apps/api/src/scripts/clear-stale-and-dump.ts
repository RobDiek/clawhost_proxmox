/** Clear ALL stale wrapper flags (the accidental strategy_options re-run cascaded
 *  them; inputs unchanged → downstream valid). Dump the imported_objective_transition
 *  proposals (the ROAS-400% bidding transitions) + conversion maturity. READ+WRITE(stale only). */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { readResearchData, writeResearchData } from '@/services/agentContext'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const instanceId = agent.vpsInstanceId
    const rd: any = await readResearchData(agent, instanceId)

    // clear every stale marker we can find
    let cleared = 0
    const holders = [rd._artifactFreshness, rd.plan?.stale, rd.plan?.staleWrappers, rd.plan]
    for (const h of holders) {
        if (!h || typeof h !== 'object') continue
        for (const k of Object.keys(h)) {
            if (h[k] && typeof h[k] === 'object' && h[k].stale) { delete h[k].stale; cleared++ }
        }
    }
    await writeResearchData(agent, instanceId, rd)
    console.log(`stale markers cleared: ${cleared}`)
    console.log('_artifactFreshness after:', JSON.stringify(rd._artifactFreshness)?.slice(0, 300))

    // dump the ROAS-transition proposals
    const trans = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'imported_objective_transition'))) as any[]
    const active = trans.filter(t => t.status !== 'archived')
    console.log(`\nimported_objective_transition: ${active.length} active`)
    for (const t of active) {
        let c: any = t.content; if (typeof c === 'string') { try { c = JSON.parse(c) } catch { /**/ } }
        console.log(`  [${t.status}] ${String(t.title).slice(0, 55)}`)
        console.log(`     reason: ${JSON.stringify(c?.reason || c?.rationale || c?.maturity || c?.summary || c)?.slice(0, 200)}`)
        console.log(`     created: ${t.createdAt}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })