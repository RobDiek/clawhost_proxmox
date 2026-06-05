/** Run the SEO + AEO (LLM-promotion) + content auto-cluster through the REAL
 * executor (tsx → fresh code incl new routing). Sets each proposed task to
 * approved, executes, records completion. Reports per-task outcome so gaps surface.
 *   node --env-file=.env --import tsx src/scripts/run-seo-batch.ts <agentId> [--only=cap1,cap2] [--dry]
 */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { classifyTask } from '@/services/executorCapabilities'
import { executeTask } from '@/services/monthlyTaskExecutor'
import { mutateResearchData } from '@/services/agentContext'

// SEO + AEO + content capabilities we want to auto-close (not Ads/GTM/Meta/WA).
const SEO_AEO_CAPS = new Set([
    'seo.product_schema', 'seo.schema', 'seo.internal_links', 'seo.image_alt', 'seo.slug', 'seo.meta',
    'aeo.llms_txt', 'aeo.answer_first', 'cms.page_refresh', 'cms.landing_page', 'content.create',
])

async function main() {
    const instanceId = '44f484a852', agentId = process.argv[2] || 'mta_Un9jXRuf'
    const onlyArg = process.argv.find(a => a.startsWith('--only='))
    const only = onlyArg ? new Set(onlyArg.split('=')[1].split(',')) : null
    const dry = process.argv.includes('--dry')

    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const tasks: any[] = a?.researchData?.monthlyPlan?.tasks || []

    // Use the agent-review verdict (it already applies NOT_AUTO overrides for
    // CRO/AI-citation/Wikidata/etc.) — only run what's honestly recommend_now.
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'monthly_task'))) as any[]
    const verdictByTaskId = new Map<string, string>()
    for (const r of rows) { const md: any = r.metadata || {}; if (md.taskId && md.agentReview?.verdict) verdictByTaskId.set(md.taskId, md.agentReview.verdict) }

    const targets = tasks.filter(t => {
        if (t.status !== 'proposed' && t.status !== 'approved') return false
        if (verdictByTaskId.get(t.id) !== 'recommend_now') return false   // honest auto-set only
        const { capabilityId } = classifyTask(t)
        if (!SEO_AEO_CAPS.has(capabilityId)) return false
        if (only && !only.has(capabilityId)) return false
        return true
    })

    console.log(`SEO+AEO auto-cluster: ${targets.length} tasks${dry ? ' (DRY — list only)' : ''}`)
    for (const t of targets) console.log(`  [${classifyTask(t).capabilityId}] ${String(t.title).slice(0, 60)} (status=${t.status})`)
    if (dry) { process.exit(0) }

    const results: any[] = []
    for (const t of targets) {
        try {
            if (t.status !== 'approved') {
                await mutateResearchData(a, instanceId, (rd: any) => {
                    const tk = (rd.monthlyPlan?.tasks || []).find((x: any) => x.id === t.id)
                    if (tk) tk.status = 'approved'
                    return rd
                })
            }
            const res = await executeTask(instanceId, t.id, agentId)
            results.push({ id: t.id, cap: classifyTask(t).capabilityId, title: String(t.title).slice(0, 50), ok: res.ok, cat: res.errorCategory, desc: String(res.outputDescription || '').slice(0, 120) })
            console.log(`\n[${res.ok ? 'OK' : 'XX'}] ${classifyTask(t).capabilityId} · ${String(t.title).slice(0, 50)}\n   ${res.errorCategory || ''} · ${String(res.outputDescription || res.error || '').slice(0, 160)}`)
        } catch (e) {
            results.push({ id: t.id, cap: classifyTask(t).capabilityId, title: String(t.title).slice(0, 50), ok: false, cat: 'threw', desc: (e as Error).message.slice(0, 120) })
            console.log(`\n[XX] ${classifyTask(t).capabilityId} · ${String(t.title).slice(0, 50)} THREW: ${(e as Error).message.slice(0, 160)}`)
        }
    }
    const ok = results.filter(r => r.ok).length
    console.log(`\n===== DONE: ${ok}/${results.length} ok =====`)
    for (const r of results.filter(r => !r.ok)) console.log(`  FAIL [${r.cap}] ${r.title} · ${r.cat} · ${r.desc}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })