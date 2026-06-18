/** MS — final: resync conversion goal (include new offline action) + verify
 *  tracking health + conversion-action roles end-to-end.
 *   node --env-file=.env --import tsx src/scripts/ms-final.ts
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ensureCampaignGoalIsolation } from '@/services/campaignGoalIsolation'
import { runTrackingHealthCheck } from '@/services/trackingHealthCheck'
import { detectExistingConversionActions } from '@/services/mazhirConversionsDetect'

const AGENT = 'mta_Xm8CfS3K', INSTANCE = '44f484a852'

async function main() {
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    if (!agent) throw new Error('MS agent not found')

    console.log('═══ goal isolation resync (include offline action 7653142208) ═══')
    const iso = await ensureCampaignGoalIsolation(agent as any, { source: 'ms-cleanup-2026-06-18' })
    console.log('  ', JSON.stringify({ status: iso.status, reason: iso.reason, resyncedGoals: iso.resyncedGoals, campaignsIsolated: iso.campaignsIsolated }))

    console.log('\n═══ tracking health (MS) ═══')
    const h = await runTrackingHealthCheck(INSTANCE, AGENT)
    console.log(`  score: ${h.score}/100`)
    for (const c of h.checks) console.log(`  ${c.status === 'pass' ? '✅' : c.status === 'warn' ? '🟡' : c.status === 'skip' ? '⚪' : '🔴'} [${c.id}] ${c.he}`)

    console.log('\n═══ MS conversion actions (roles) ═══')
    const det: any = await detectExistingConversionActions(INSTANCE, AGENT)
    for (const c of (det.candidates || []).filter((x: any) => x.brandAffinity === 'this' || /offline|moving/i.test(x.name)))
        console.log(`  • ${c.name} · cat=${c.category} · primary=${c.primaryForGoal} · inConv=${c.includeInConversionsMetric} · affinity=${c.brandAffinity}`)

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })