/** Enable SEO+AI tracking for Packing + run the first weekly cycle (live). */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { MatehAgentRow } from '@/services/agentContext'
import { updateSeoTracking, readSeoTracking, deriveScope } from '@/services/seoTracking'
import { runSeoTrackingForAgent } from '@/services/seoTrackingRunner'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const monthly = process.argv.includes('--monthly')
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as MatehAgentRow[]
    const instanceId = agent.vpsInstanceId
    const scope = deriveScope(agent)
    console.log(`scope: domain=${scope.domain} keywords=${scope.keywords.length} competitors=${scope.competitors.length} llmPrompts=${scope.llmPrompts.length}`)

    await updateSeoTracking(agent, instanceId, (s) => ({
        ...s,
        config: {
            rankTracking: true, perKeywordSerp: true, trafficTracking: true,
            keywordGap: true, aiKeywordData: true,
            llmMentions: false,           // needs DFS subscription — off for now
            llmResponses: true,
            engines: ['chat_gpt', 'gemini', 'perplexity', 'claude'],
            enabled: true,
            monthlyCapUsdCents: 3000,      // $30/mo cap
            optedInAt: s.config.optedInAt || new Date().toISOString(),
        },
        scope,
        status: 'active',
    }))
    console.log('config enabled (cap $30). Running cycle' + (monthly ? ' (weekly+monthly)' : ' (weekly)') + '…')

    const [fresh] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as MatehAgentRow[]
    const summary = await runSeoTrackingForAgent(fresh, { force: true, weekly: true, monthly })
    console.log('SUMMARY:', JSON.stringify(summary))

    const [after] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as MatehAgentRow[]
    const st = readSeoTracking(after)
    console.log('series:', JSON.stringify({
        ranks: st.series.ranks.length, keywordPositions: st.series.keywordPositions.length,
        traffic: st.series.traffic.length, aiMentions: st.series.aiMentions.length, aiResponses: st.series.aiResponses.length,
    }))
    if (st.series.ranks.length) console.log('latest rank point:', JSON.stringify(st.series.ranks[st.series.ranks.length - 1]))
    if (st.series.traffic.length) console.log('latest traffic point:', JSON.stringify(st.series.traffic[st.series.traffic.length - 1]))
    if (st.series.keywordPositions.length) {
        const kp = st.series.keywordPositions[st.series.keywordPositions.length - 1].byKeyword
        const ranked = Object.entries(kp).filter(([, v]) => v != null)
        console.log(`keyword positions: ${ranked.length}/${Object.keys(kp).length} ranked; sample:`, JSON.stringify(ranked.slice(0, 6)))
    }
    console.log('spend this month: $' + JSON.stringify(st.spend.byMonth))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })