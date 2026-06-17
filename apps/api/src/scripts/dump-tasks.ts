/** READ-ONLY: dump per-task monthly_task rows from the latest regen. */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq, gt, desc } from 'drizzle-orm'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const since = new Date('2026-06-05T11:00:00Z')
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), gt(agentOutputs.createdAt, since)))
        .orderBy(desc(agentOutputs.createdAt)) as any[]
    const byType: Record<string, number> = {}
    const tasks: any[] = []
    for (const r of rows) {
        byType[r.outputType] = (byType[r.outputType] || 0) + 1
        if (r.outputType !== 'monthly_task') continue
        let c: any = r.content
        if (typeof c === 'string') { try { c = JSON.parse(c) } catch { c = {} } }
        const md: any = r.metadata || {}
        tasks.push({ title: r.title, priority: md.priority || c.priority, channel: md.channel, type: md.type, summary: c.summary, taskId: md.taskId, dependsOn: md.dependsOn, _status: r.status })
    }
    console.log('outputType counts (since 11:00):', JSON.stringify(byType))
    console.log(`task-like rows: ${tasks.length}`)
    const byP: Record<string, any[]> = { P0: [], P1: [], P2: [], other: [] }
    for (const t of tasks) (byP[t.priority] || byP.other).push(t)
    for (const pr of ['P0', 'P1', 'P2', 'other']) {
        if (!byP[pr].length) continue
        console.log(`\n===== ${pr} (${byP[pr].length}) =====`)
        for (const t of byP[pr]) console.log(`  • [${(t.channel || t.category || '?')}] ${t.title}`)
    }
    console.log(`\n===== BIDDING / ROAS tasks (verify staging) =====`)
    const re = /roas|bidding|tcpa|troas|הצעות|אסטרטגי|מקסימום|maximize|יעד|כל ה?המרות/i
    for (const t of tasks) {
        if (re.test(t.title || '') || re.test(t.summary || '')) {
            console.log(`\n[${t.priority}] ${t.title}`)
            console.log(`   ${String(t.summary || '').slice(0, 300)}`)
        }
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })