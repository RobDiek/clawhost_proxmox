/** Set per-tenant conversionTrackingReliableSince (date conversion tracking became clean). */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { readResearchData, writeResearchData } from '@/services/agentContext'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const since = process.argv[3] || '2026-06-04'
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const rd: any = await readResearchData(agent, agent.vpsInstanceId)
    rd.conversionTrackingReliableSince = since
    await writeResearchData(agent, agent.vpsInstanceId, rd)
    console.log(`${agentId}: conversionTrackingReliableSince = ${since}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })