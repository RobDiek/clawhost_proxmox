/** READ-ONLY: how many plan tasks carry scheduledFor, and their spread by week —
 * to explain what the content calendar will render.
 *   node --env-file=.env --import tsx src/scripts/verify-schedule.ts [agentId]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const tasks: any[] = a?.researchData?.monthlyPlan?.tasks || []
    let withDate = 0, noDate = 0
    const byWeek: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const isoWeek = (d: string) => { const dt = new Date(d); const onejan = new Date(dt.getFullYear(), 0, 1); const wk = Math.ceil((((dt.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7); return `${dt.getFullYear()}-W${wk}` }
    for (const t of tasks) {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1
        if (t.scheduledFor) { withDate++; const wk = isoWeek(String(t.scheduledFor).slice(0, 10)); byWeek[wk] = (byWeek[wk] || 0) + 1 }
        else noDate++
    }
    console.log(`agent=${agentId} tasks=${tasks.length}`)
    console.log(`with scheduledFor: ${withDate} · without: ${noDate}`)
    console.log('by status:', JSON.stringify(byStatus))
    console.log('scheduledFor by ISO week:')
    for (const k of Object.keys(byWeek).sort()) console.log(`  ${k}: ${byWeek[k]}`)
    // date range
    const dates = tasks.map(t => t.scheduledFor).filter(Boolean).map((d: string) => String(d).slice(0, 10)).sort()
    if (dates.length) console.log(`range: ${dates[0]} → ${dates[dates.length - 1]}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })