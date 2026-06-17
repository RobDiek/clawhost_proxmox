/** READ-ONLY: confirm rd.monthlyPlan.tasks is intact + locate the meta task. */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const rd: any = a?.researchData || {}
    const tasks: any[] = rd.monthlyPlan?.tasks || []
    console.log(`rd.monthlyPlan present=${!!rd.monthlyPlan} · tasks=${tasks.length} · generatedAt=${rd.monthlyPlan?.generatedAt}`)
    const meta = tasks.find(t => /meta description|תיאורי מטא|meta desc/i.test(t.title || ''))
    if (meta) console.log(`META task → id=${meta.id} status=${meta.status} title="${meta.title}" deps=${JSON.stringify(meta.dependsOn || [])}`)
    else console.log('META task NOT FOUND in rd.monthlyPlan.tasks')
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })