/** Re-run seoSchemaBatch once (catches pages that previously failed JSON-gen, e.g. 6811). */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runSeoSchemaBatch } from '@/services/seoSchemaBatch'
async function main() {
    const instanceId = '44f484a852', agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const businessName = a?.researchData?.answers?.businessName
    const res = await runSeoSchemaBatch(instanceId, { agentId, businessName }) as any
    console.log(`scanned=${res.scanned} candidates=${res.candidates} updated=${res.updated?.length} failures=${res.failures?.length}`)
    for (const u of res.updated || []) console.log(`  +#${u.id} "${String(u.title).slice(0, 40)}" [${u.types.join(',')}]`)
    for (const f of res.failures || []) console.log(`  FAIL #${f.id}: ${f.error}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })