/** Inspect (and optionally clear) research_data.biddingObjective for an agent.
 * A buggy bid-task run wrote a wrong objective; clearing restores the true
 * "not yet set" state so the legitimate tROAS task sets it correctly later.
 *   node --env-file=.env --import tsx src/scripts/fix-bidding-objective.ts <agentId> [--clear]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { mutateResearchData } from '@/services/agentContext'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const doClear = process.argv.includes('--clear')
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    if (!a) { console.log('agent not found'); process.exit(1) }
    console.log('current biddingObjective:', JSON.stringify((a.researchData || {}).biddingObjective))
    if (doClear) {
        await mutateResearchData(a, a.vpsInstanceId, (rd: any) => { delete rd.biddingObjective; return rd })
        const [a2] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
        console.log('after clear:', JSON.stringify((a2.researchData || {}).biddingObjective))
    }
    if (process.argv.includes('--restore-troas400')) {
        // Restore Sergei's manual tROAS 400% objective (accidentally cleared).
        const obj = { goal: 'target_roas', source: 'user', chosenAt: '2026-06-01T09:04:59Z', chosenBy: 'sergei-manual', recommended: false, targetRoasPct: 400 }
        await mutateResearchData(a, a.vpsInstanceId, (rd: any) => { rd.biddingObjective = obj; return rd })
        const [a3] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
        console.log('after restore:', JSON.stringify((a3.researchData || {}).biddingObjective))
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })