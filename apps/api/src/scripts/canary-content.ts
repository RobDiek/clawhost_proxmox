/** Diagnose + test content.create E2E: inspect contentPlan shape, pick a cp_ item
 * appended by a content.create task, and try to draft it via planDraftRunner.
 *   node --env-file=.env --import tsx src/scripts/canary-content.ts [agentId]
 */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { draftDuePlanItemsForInstance } from '@/services/planDraftRunner'

async function main() {
    const instanceId = '44f484a852', agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const rd: any = a?.researchData || {}
    const cp = rd.contentPlan
    console.log(`contentPlan: isArray=${Array.isArray(cp)} typeof=${typeof cp} hasItems=${!!(cp && cp.items)} itemsLen=${(cp && cp.items && cp.items.length) || 0} arrLen=${Array.isArray(cp) ? cp.length : 'n/a'}`)
    const items: any[] = Array.isArray(cp) ? cp : (cp && Array.isArray(cp.items) ? cp.items : [])
    const cpItems = items.filter(i => String(i.id || '').startsWith('cp_'))
    console.log(`cp_ items: ${cpItems.length}`)
    if (cpItems[0]) console.log(`sample item keys: ${Object.keys(cpItems[0]).join(', ')}`)
    if (cpItems[0]) console.log(`sample: id=${cpItems[0].id} status=${cpItems[0].status} date=${cpItems[0].date} type=${cpItems[0].type} title="${String(cpItems[0].title || cpItems[0].hook || cpItems[0].pillar || '').slice(0, 50)}"`)

    // existing generated content outputs?
    const gen = await db.select({ id: agentOutputs.id, t: agentOutputs.outputType, st: agentOutputs.status })
        .from(agentOutputs).where(and(eq(agentOutputs.agentId, agentId), inArray(agentOutputs.outputType, ['blog_article', 'content_post']))) as any[]
    console.log(`\nexisting blog_article/content_post outputs: ${gen.length}`)

    // Try to draft one cp_ item — pass the TASK's agent so the item is found
    // on its own mateh_agents row (not the primary).
    const target = cpItems[0]
    if (target) {
        console.log(`\n=== draftDuePlanItemsForInstance(onlyItemId=${target.id}, agent=${agentId}) ===`)
        const r = await draftDuePlanItemsForInstance(instanceId, { onlyItemId: target.id, agent: a })
        console.log(`drafted=${JSON.stringify(r.drafted)} skipped=${r.skipped} failed=${JSON.stringify(r.failed)}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })