/** Dump the AI-responses AEO signal + generate the first monthly report card. */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { MatehAgentRow } from '@/services/agentContext'
import { readSeoTracking } from '@/services/seoTracking'
import { generateMonthlyReportCard } from '@/services/monthlyReportCard'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as MatehAgentRow[]
    const st = readSeoTracking(agent)
    const resp = st.series.aiResponses[st.series.aiResponses.length - 1]
    console.log('=== AEO signal (AI responses, per engine) ===')
    console.log(resp ? JSON.stringify(resp.perEngine, null, 1) : 'none')

    console.log('\n=== generating report card ===')
    const r = await generateMonthlyReportCard(agent, agent.vpsInstanceId)
    console.log('outputId:', r.outputId)
    const [row] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, r.outputId!)) as any[]
    let c: any = row?.content; if (typeof c === 'string') { try { c = JSON.parse(c) } catch { /**/ } }
    console.log('\n=== REPORT CARD (displayHe) ===\n')
    console.log((c?.displayHe || '(no displayHe)').slice(0, 2600))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })