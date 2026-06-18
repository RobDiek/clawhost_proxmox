/** MS Stage D — offline gclid bridge (the PS scheme). Ensures the MS offline
 *  conversion action exists, then dry-runs the store-orders upload to see how
 *  many recent orders carry a gclid. No live upload unless --apply.
 *   node --env-file=.env --import tsx src/scripts/ms-stage-d-offline.ts [--apply]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ensureOfflineAction, uploadNewStoreOrders } from '@/services/offlineConversionUpload'

const AGENT = 'mta_Xm8CfS3K'

async function main() {
    const apply = process.argv.includes('--apply')
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    if (!agent) throw new Error('MS agent not found')

    console.log('→ ensureOfflineAction (create/verify MS offline conversion action)')
    const ens = await ensureOfflineAction(agent as any)
    console.log('  ', JSON.stringify(ens, null, 2))

    // reload agent so it carries the offlineConversions just persisted
    const [fresh] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    console.log(`\n→ uploadNewStoreOrders dryRun=${!apply}`)
    const up = await uploadNewStoreOrders(fresh as any, { dryRun: !apply })
    console.log('  ', JSON.stringify(up, null, 2))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })