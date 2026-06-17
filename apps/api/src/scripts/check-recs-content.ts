/** READ-ONLY: is the ads-recs task content valid JSON or truncated? */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq, desc } from 'drizzle-orm'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [r] = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'ads_recommendations_review'), eq(agentOutputs.status, 'pending_review')))
        .orderBy(desc(agentOutputs.createdAt)).limit(1) as any[]
    if (!r) { console.log('no pending ads-recs task'); process.exit(0) }
    const c = r.content
    console.log('content typeof:', typeof c, 'len:', String(c).length)
    let parsed = false
    try { JSON.parse(c); parsed = true } catch (e) { console.log('JSON.parse FAILED:', (e as Error).message) }
    console.log('valid JSON:', parsed)
    console.log('has displayHe in first 12000:', String(c).slice(0, 12000).indexOf('displayHe') >= 0)
    console.log('first 120:', String(c).slice(0, 120))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })