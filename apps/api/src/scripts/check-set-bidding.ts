/** Read (and optionally reset) the tenant's biddingObjective.
 *   node --env-file=.env --import tsx src/scripts/check-set-bidding.ts <instanceId> <agentId> [--set-max]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { setBiddingObjective } from '@/services/biddingObjective'

async function main() {
    const instanceId = process.argv[2] || '44f484a852', agentId = process.argv[3] || 'mta_Un9jXRuf'
    const setMax = process.argv.includes('--set-max')
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rd: any = a?.researchData || {}
    console.log('current biddingObjective:', JSON.stringify(rd.biddingObjective || null, null, 2))
    console.log('paidProfile.primaryGoal:', rd.paidProfile?.primaryGoal || rd.answers?.primaryGoal || '—')

    if (setMax) {
        await setBiddingObjective(instanceId, agentId, {
            goal: 'max_sales',
            source: 'recommended',
            recommended: true,
            rationaleHe: 'מקסימום ערך המרות עכשיו — מעקב המרות אמין הופעל היום (גשר offline ראשי). צוברים ~50 רכישות אמינות לפני מעבר ל-Target ROAS, כדי ש-Smart Bidding ילמד מנתונים יציבים ולא מ-backfill.',
            chosenAt: new Date().toISOString(),
            chosenBy: 'system:tracking-reliability-reset',
        })
        const [b] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
        console.log('\n✅ set →', JSON.stringify((b?.researchData as any)?.biddingObjective, null, 2))
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })