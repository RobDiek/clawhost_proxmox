/** Re-run monthlyPlan tasks IN ORDER through the real executor, one at a time,
 * with full per-task evaluation output. Flips each task to 'approved' then calls
 * executeTask (the real post-approval path → real adapters, real writes for
 * auto_write caps). Reports result + reads back the agent_outputs row so each
 * task can be judged (real work vs noop vs brief vs integration-gated).
 *
 *   node --env-file=.env --import tsx src/scripts/run-tasks-ordered.ts <agentId> --from=N --to=M
 *   node --env-file=.env --import tsx src/scripts/run-tasks-ordered.ts <agentId> --id=tsk_xxx
 *   (add --dry to ONLY list the range without executing)
 */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { classifyTask, classifyTaskMulti } from '@/services/executorCapabilities'
import { executeTask } from '@/services/monthlyTaskExecutor'
import { mutateResearchData } from '@/services/agentContext'

async function main() {
    const instanceId = '44f484a852'
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const fromArg = process.argv.find(a => a.startsWith('--from='))
    const toArg = process.argv.find(a => a.startsWith('--to='))
    const idArg = process.argv.find(a => a.startsWith('--id='))
    const dry = process.argv.includes('--dry')

    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const tasks: any[] = a?.researchData?.monthlyPlan?.tasks || []

    // verdict map
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'monthly_task'))) as any[]
    const verdictByTask = new Map<string, string>()
    for (const r of rows) {
        const md: any = r.metadata || {}
        if (!md.taskId) continue
        if (md.agentReview?.verdict) verdictByTask.set(md.taskId, md.agentReview.verdict)
    }

    let indices: number[]
    if (idArg) {
        const id = idArg.split('=')[1]
        const idx = tasks.findIndex(t => t.id === id)
        indices = idx >= 0 ? [idx] : []
    } else {
        const from = fromArg ? Number(fromArg.split('=')[1]) : 0
        const to = toArg ? Number(toArg.split('=')[1]) : tasks.length - 1
        indices = []
        for (let i = from; i <= to && i < tasks.length; i++) indices.push(i)
    }

    console.log(`agent=${agentId} running ${indices.length} task(s) [${indices[0]}..${indices[indices.length - 1]}]${dry ? ' (DRY)' : ''}\n`)

    for (const i of indices) {
        const t = tasks[i]
        const cls = classifyTask(t)
        const multi = classifyTaskMulti(t)
        const verdict = verdictByTask.get(t.id) || '-'
        const caps = multi.external ? 'external' : multi.capabilities.map(c => c.id).join('+')
        console.log(`\n${'='.repeat(78)}`)
        console.log(`#${i} [${t.status}→approved] ${cls.autonomy} · ${caps} · verdict=${verdict}`)
        console.log(`   type=${t.type} channel=${t.channel}`)
        console.log(`   "${String(t.title || '').slice(0, 80)}"`)
        if (dry) continue

        // flip to approved (executeTask requires it)
        if (t.status !== 'approved') {
            await mutateResearchData(a, instanceId, (rd: any) => {
                const tk = (rd.monthlyPlan?.tasks || []).find((x: any) => x.id === t.id)
                if (tk) tk.status = 'approved'
                return rd
            })
        }

        const started = Date.now()
        let res: any
        try { res = await executeTask(instanceId, t.id, agentId) }
        catch (e) { res = { ok: false, error: (e as Error).message, errorCategory: 'threw' } }
        const secs = ((Date.now() - started) / 1000).toFixed(1)

        console.log(`   → ${res.ok ? 'OK' : 'XX'} (${secs}s) cat=${res.errorCategory || '-'}`)
        if (res.outputDescription) console.log(`   desc: ${String(res.outputDescription).replace(/\s+/g, ' ').slice(0, 220)}`)
        if (res.error) console.log(`   err : ${String(res.error).slice(0, 180)}`)
        const steps = Array.isArray(res.stepResults) ? res.stepResults : []
        console.log(`   steps: ${steps.length}`)
        for (const s of steps.slice(0, 6)) console.log(`     ${s.ok ? '✓' : '✗'} ${String(s.step).slice(0, 60)}${s.detail ? ' — ' + String(s.detail).slice(0, 70) : ''}`)
        if (steps.length > 6) console.log(`     … +${steps.length - 6} more steps`)

        // read back final task status + output row status
        const [a2] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
        const tk2 = (a2?.researchData?.monthlyPlan?.tasks || []).find((x: any) => x.id === t.id)
        console.log(`   task.status now: ${tk2?.status}`)
    }
    console.log(`\n${'='.repeat(78)}\nDONE ${indices.length} task(s)`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })