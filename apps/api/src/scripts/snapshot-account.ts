/** P1 deliverable — run the read-only Ads Account Snapshot on a brand's account.
 *   node --env-file=.env --import tsx src/scripts/snapshot-account.ts [agentId] [--json]
 * Default agent = Packing Station (mta_Un9jXRuf, acct 5746845784). No writes.
 */
import { snapshotForAgent, renderSnapshotReport } from '@/services/adsAccountSnapshot'

async function main() {
    const agentId = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'mta_Un9jXRuf'
    const asJson = process.argv.includes('--json')
    console.error(`[snapshot] building for agent ${agentId} …`)
    const snap = await snapshotForAgent(agentId)
    if (asJson) console.log(JSON.stringify(snap, null, 2))
    else console.log(renderSnapshotReport(snap))
    process.exit(snap.ok ? 0 : 1)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })