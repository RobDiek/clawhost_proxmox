/** MS — mark the cabinet monthly_task items we COMPLETED this session as done
 *  (status='completed' → leaves the active pending list) + mirror into the
 *  research_data monthly plan. Dry-run lists; --apply writes.
 *   node --env-file=.env --import tsx src/scripts/ms-mark-done.ts [--apply]
 */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

const AGENT = 'mta_Xm8CfS3K'
// Title substrings of tasks we actually completed this session.
const DONE = [
    'התקנת קטע קוד GTM',                    // GTM snippet installed (our WLZ3CX7B)
    'הפרדת המרות ראשיות ומשניות',           // primary/secondary conversion separation
    'בידוד יעדי המרה מקמפיינים של Packing', // conversion-goal isolation from sibling
    'יצירת נכס GA4',                        // GA4 property (exists + wired)
    'הגדרת 8 אירועי מדידה ב-GA4',           // GA4 events incl purchase/whatsapp/phone/form
    'התקנת מצב הסכמה',                      // Consent Mode v2 (GTM consent tags)
]

async function main() {
    const apply = process.argv.includes('--apply')
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    const tasks = await db.select().from(agentOutputs).where(and(
        eq(agentOutputs.agentId, AGENT),
        eq(agentOutputs.outputType, 'monthly_task'),
        eq(agentOutputs.status, 'pending_review'),
    ))
    console.log(apply ? '⚙  APPLY\n' : '👀 DRY-RUN\n', `${tasks.length} pending monthly_task`)

    const toComplete = tasks.filter(t => DONE.some(d => (t.title || '').includes(d)))
    const remaining = tasks.filter(t => !toComplete.includes(t))
    console.log(`\n✅ MARK DONE (${toComplete.length}):`)
    for (const t of toComplete) console.log(`   ${t.id} · ${(t.title || '').slice(0, 60)}`)
    console.log(`\n⏳ LEAVE pending (${remaining.length}):`)
    for (const t of remaining) console.log(`   ${(t.title || '').slice(0, 60)}`)

    if (!apply) { console.log('\ndry-run — nothing written.'); process.exit(0) }

    for (const t of toComplete) {
        await db.update(agentOutputs).set({
            status: 'completed',
            updatedAt: new Date(),
            metadata: { ...((t.metadata as any) || {}), completedManually: true, completedNote: 'выполнено в рамках MS analytics cleanup (сессия 2026-06-18)', completedAt: new Date().toISOString() } as any,
        }).where(eq(agentOutputs.id, t.id))
    }
    // mirror into research_data monthly plan (best-effort, by title match)
    const { mutateResearchData } = await import('@/services/agentContext')
    await mutateResearchData(agent as any, agent!.vpsInstanceId, (cur: any) => {
        const c = cur || {}
        const plan = c.monthlyPlan || c.savedPlan
        const list = plan?.tasks
        if (Array.isArray(list)) for (const task of list) {
            const title = task.title || task.task || task.titleHe || ''
            if (DONE.some(d => String(title).includes(d))) task.status = 'completed'
        }
        return c
    })
    console.log(`\n✅ marked ${toComplete.length} tasks completed + mirrored to plan`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })