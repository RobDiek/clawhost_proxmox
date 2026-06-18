/** P2 deliverable — dry-run the Foundation reconciler: snapshot → DeltaPlan.
 *   node --env-file=.env --import tsx src/scripts/foundation-plan.ts [agentId] [--json]
 * Default agent = Packing (mta_Un9jXRuf). NO tasks, NO writes — prints the plan.
 */
import { snapshotForAgent, renderSnapshotReport } from '@/services/adsAccountSnapshot'
import { loadAgent, reconcileForAgent, renderDeltaPlan } from '@/services/foundationReconciler'

async function main() {
    const agentId = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'mta_Un9jXRuf'
    const asJson = process.argv.includes('--json')
    const showSnap = process.argv.includes('--snap')
    console.error(`[foundation-plan] ${agentId} …`)
    const snap = await snapshotForAgent(agentId)
    if (!snap.ok) { console.error('snapshot failed:', snap.error); process.exit(1) }
    const agent = await loadAgent(agentId)
    if (!agent) { console.error('agent not found'); process.exit(1) }
    const plan = await reconcileForAgent(agent, snap)
    if (asJson) { console.log(JSON.stringify(plan, null, 2)); process.exit(0) }
    if (showSnap) console.log(renderSnapshotReport(snap) + '\n')
    console.log(renderDeltaPlan(plan))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })