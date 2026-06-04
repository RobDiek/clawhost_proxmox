/** Run campaign-goal isolation for a tenant (consolidate purchase actions —
 * exclude sibling-brand conversions from this tenant's campaign bidding).
 *   node --env-file=.env --import tsx src/scripts/run-goal-isolation.ts <agentId>
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ensureCampaignGoalIsolation } from '@/services/campaignGoalIsolation'

async function main() {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, process.argv[2] || 'mta_Un9jXRuf'))
    if (!a) throw new Error('agent not found')
    const d = await ensureCampaignGoalIsolation(a as any, { source: 'manual_consolidation' })
    console.log('\n=== isolation decision ===')
    console.log(JSON.stringify(d, null, 2))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })