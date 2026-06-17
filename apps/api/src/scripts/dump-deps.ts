/** READ-ONLY: latest plan tasks with dependencies → topological levels + risk tags. */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq, gt } from 'drizzle-orm'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const since = new Date(Date.now() - 36 * 3600 * 1000)
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'monthly_task'), gt(agentOutputs.createdAt, since))) as any[]
    let latestGen = ''
    for (const r of rows) { const g = (r.metadata as any)?.monthlyPlanGeneratedAt || ''; if (g > latestGen) latestGen = g }
    const planRows = rows.filter(r => (r.metadata as any)?.monthlyPlanGeneratedAt === latestGen)

    const tasks = planRows.map(r => {
        const md: any = r.metadata || {}
        return { id: md.taskId, title: r.title, priority: md.priority, channel: md.channel, type: md.type, deps: md.dependsOn || [] }
    })
    const byId = new Map(tasks.map(t => [t.id, t]))
    console.log(`gen=${latestGen} · tasks=${tasks.length}`)

    // topological levels
    const level = new Map<string, number>()
    const calc = (id: string, seen: Set<string>): number => {
        if (level.has(id)) return level.get(id)!
        if (seen.has(id)) return 0
        seen.add(id)
        const t = byId.get(id); if (!t || !t.deps.length) { level.set(id, 0); return 0 }
        const L = 1 + Math.max(0, ...t.deps.filter((d: string) => byId.has(d)).map((d: string) => calc(d, seen)))
        level.set(id, L); return L
    }
    for (const t of tasks) calc(t.id, new Set())
    const maxL = Math.max(...[...level.values()])
    for (let L = 0; L <= maxL; L++) {
        const here = tasks.filter(t => level.get(t.id) === L)
        if (!here.length) continue
        console.log(`\n===== LEVEL ${L} (${here.length}) — can run after level ${L - 1} done =====`)
        for (const t of here) {
            const depTitles = t.deps.map((d: string) => byId.get(d)?.id || d).join(', ')
            console.log(`  [${t.priority}/${t.channel}] ${t.title}${t.deps.length ? `  ⟵ deps: ${depTitles}` : ''}`)
        }
    }

    // dependency edges that point to MISSING tasks (cross-plan / dangling)
    console.log(`\n===== dangling deps (point to task not in this plan) =====`)
    for (const t of tasks) for (const d of t.deps) if (!byId.has(d)) console.log(`  ${t.id} ⟵ ${d} (MISSING)`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })