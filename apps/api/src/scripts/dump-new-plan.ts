/** READ-ONLY: dump the latest monthly_plan tasks — priority, title, + flag bidding/ROAS tasks. */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq, desc } from 'drizzle-orm'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [row] = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'monthly_marketing_plan')))
        .orderBy(desc(agentOutputs.createdAt)).limit(1)
    let p: any = (row as any).content ?? (row as any).payload ?? {}
    if (typeof p === 'string') { try { p = JSON.parse(p) } catch { /* keep */ } }
    const plan = p.monthlyPlan || p
    const tasks: any[] = plan.tasks || []
    console.log(`outputId-ish created=${(row as any).createdAt} · tasks=${tasks.length} · theme="${plan.keyTheme || ''}"`)

    const byP: Record<string, any[]> = { P0: [], P1: [], P2: [], other: [] }
    for (const t of tasks) (byP[t.priority] || byP.other).push(t)
    for (const pr of ['P0', 'P1', 'P2']) {
        console.log(`\n===== ${pr} (${byP[pr].length}) =====`)
        for (const t of byP[pr]) console.log(`  • ${t.title}`)
    }

    // Flag any bidding/ROAS task — print full title+summary to verify staging
    console.log(`\n===== BIDDING / ROAS tasks (verify staging) =====`)
    const re = /roas|bidding|tcpa|troas|הצעות|אסטרטגי|מקסימום|maximize|יעד/i
    for (const t of tasks) {
        if (re.test(t.title || '') || re.test(t.summary || '')) {
            console.log(`\n[${t.priority}] ${t.title}`)
            console.log(`   ${String(t.summary || '').slice(0, 280)}`)
        }
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })