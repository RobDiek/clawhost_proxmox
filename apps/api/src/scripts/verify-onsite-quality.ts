/** READ-ONLY: dump the ACTUAL execution result of each on-site task just run,
 *  to assess quality + catch mis-routes (task says X, adapter did Y). */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq, desc } from 'drizzle-orm'
import { classifyTask } from '@/services/executorCapabilities'

const ONSITE = new Set(['seo.schema', 'seo.meta', 'seo.internal_links', 'seo.image_alt', 'seo.product_schema'])

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const tasks: any[] = (a?.researchData?.monthlyPlan?.tasks || [])
    const onsite = tasks.filter(t => ONSITE.has(classifyTask(t).capabilityId) && (t.status === 'completed' || t.executionOutputId || t.status === 'awaiting_manual'))
    console.log(`on-site tasks executed: ${onsite.length}\n`)
    for (const t of onsite) {
        const cap = classifyTask(t).capabilityId
        let out: any = null
        if (t.executionOutputId) {
            const [r] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, t.executionOutputId)) as any[]
            out = r
        }
        let c: any = out?.content; if (typeof c === 'string') { try { c = JSON.parse(c) } catch { /**/ } }
        const desc = (c && (c.outputDescription || c.summary)) || (typeof out?.content === 'string' ? out.content.slice(0, 140) : '')
        console.log(`■ [${cap}] status=${t.status} · "${String(t.title).slice(0, 52)}"`)
        console.log(`   → ${String(desc).replace(/\n/g, ' ').slice(0, 220)}`)
        if (c?.stepResults) for (const s of c.stepResults.slice(0, 3)) console.log(`     · ${s.step}: ${s.ok} — ${String(s.detail).slice(0, 90)}`)
        console.log('')
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })