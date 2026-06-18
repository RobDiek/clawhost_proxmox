/** MS — backfill the offline bridge: move the watermark back ~30d so the runner
 *  uploads the historical gclid orders (29 found) once the new conversion action
 *  clears its ~6h cooldown. Prevents the offline-primary goal from starving
 *  MAXIMIZE_CONVERSIONS. Idempotent (Ads dedups by orderId + _clawflow_ads_uploaded).
 *   node --env-file=.env --import tsx src/scripts/ms-offline-backfill.ts [--apply]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { mutateResearchData } from '@/services/agentContext'
import { uploadNewStoreOrders } from '@/services/offlineConversionUpload'

const AGENT = 'mta_Xm8CfS3K'
const BACKFILL_FROM = '2026-06-04T00:00:00.000Z'   // start of the gclid-capture era (29 eligible orders)

async function main() {
    const apply = process.argv.includes('--apply')
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    if (!agent) throw new Error('MS agent not found')
    const cur: any = (agent.researchData as any)?.offlineConversions || {}
    console.log(apply ? '⚙  APPLY\n' : '👀 DRY-RUN\n')
    console.log('current watermark:', cur.watermark, '→ backfill from', BACKFILL_FROM)
    if (!apply) { console.log('\ndry-run — would reset watermark + attempt upload (runner retries through cooldown).'); process.exit(0) }

    await mutateResearchData(agent as any, agent.vpsInstanceId, (c: any) => {
        const x = c || {}
        x.offlineConversions = { ...(x.offlineConversions || {}), watermark: BACKFILL_FROM }
        return x
    })
    console.log('watermark reset →', BACKFILL_FROM)

    // attempt a real upload now (reads stored watermark, advances on success).
    // If the action is still in cooldown, it errors → watermark HELD → the
    // periodic runner retries and uploads once ready.
    const [fresh] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    const r = await uploadNewStoreOrders(fresh as any, { dryRun: false })
    console.log('upload attempt:', JSON.stringify({ status: r.status, reason: r.reason, scanned: r.scanned, eligible: r.eligible, uploaded: r.uploaded, errors: (r.errors || []).slice(0, 2) }))
    if ((r.uploaded || 0) > 0) console.log(`\n✅ ${r.uploaded} historical gclid conversions uploaded → offline goal now has data`)
    else console.log('\n⏳ likely action cooldown (~6h) — watermark held at backfill point; runner will upload once ready')
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })