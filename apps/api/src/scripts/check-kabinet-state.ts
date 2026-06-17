/** READ-ONLY: diagnose kabinet task count + ROAS dupes + chosenScenario staleness. */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const rows = await db.select().from(agentOutputs).where(eq(agentOutputs.agentId, agentId)) as any[]
    const active = rows.filter(r => r.status !== 'archived' && r.status !== 'rejected')
    console.log(`active (non-archived/rejected) agent_outputs: ${active.length}`)
    const byType: Record<string, number> = {}
    for (const r of active) byType[r.outputType] = (byType[r.outputType] || 0) + 1
    console.log('by type:', JSON.stringify(byType))
    // monthly_task gens
    const mt = active.filter(r => r.outputType === 'monthly_task')
    const genCount: Record<string, number> = {}
    for (const r of mt) { const g = (r.metadata?.monthlyPlanGeneratedAt || '?').slice(0, 16); genCount[g] = (genCount[g] || 0) + 1 }
    console.log('monthly_task by gen:', JSON.stringify(genCount))
    // ROAS / 400 tasks
    const roas = mt.filter(r => /ROAS|400%|400 ?%/i.test(r.title || ''))
    console.log(`\nROAS/400 tasks: ${roas.length}`)
    for (const r of roas.slice(0, 8)) console.log(`  [${r.status}] ${String(r.title).slice(0, 70)} (gen ${(r.metadata?.monthlyPlanGeneratedAt || '?').slice(0, 16)})`)
    // chosenScenario staleness
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const rd: any = a?.researchData || {}
    console.log('\nchosenScenario.key:', rd.chosenScenario?.key, '| target ROAS:', JSON.stringify(rd.chosenScenario?.kpis?.month3?.roas ?? rd.chosenScenario?.targetRoas ?? rd.chosenScenario?.roas))
    console.log('chosenScenario set/runAt:', rd.chosenScenario?.runAt || rd.chosenScenario?.pickedAt || '(no timestamp)')
    console.log('strategy_options.runAt:', rd.results?.strategy_options?.runAt)
    console.log('plan.status.strategy_options:', JSON.stringify(rd.plan?.status?.strategy_options))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })