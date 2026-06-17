/** LIVE verify the NEW DataForSEO endpoints on Packing (minimal spend: 1 call each).
 *  Confirms field names are accepted (status 20000), surfaces 40000 if not. */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { MatehAgentRow } from '@/services/agentContext'
import { deriveScope } from '@/services/seoTracking'
import { domainRankOverview, historicalRankOverview, historicalBulkTrafficEstimation, domainIntersection } from '@/services/research/dataforseo/endpoints'
import { llmMentionsAggregated, llmResponse, aiKeywordSearchVolume } from '@/services/research/dataforseo/aiOptimization'

async function try1(name: string, fn: () => Promise<any>) {
    try {
        const r = await fn()
        const cost = r.cost ?? '?'
        const sample = JSON.stringify(r.items?.[0] ?? r.entries?.[0] ?? r.result?.[0] ?? r).slice(0, 180)
        console.log(`✅ ${name} — cost=$${cost} sample=${sample}`)
    } catch (e: any) {
        console.log(`❌ ${name} — ${e?.kind || ''} ${e?.message || e}`)
    }
}

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as MatehAgentRow[]
    const instanceId = agent.vpsInstanceId
    const scope = deriveScope(agent)
    const domain = scope.domain || 'packing-station.co.il'
    const kw = scope.keywords[0] || 'קרטונים למעבר דירה'
    console.log(`agent=${agentId} domain=${domain} kw="${kw}" competitors=${scope.competitors.length}\n`)

    // Labs (cheap)
    await try1('domainRankOverview', () => domainRankOverview(instanceId, domain))
    await try1('historicalRankOverview', () => historicalRankOverview(instanceId, domain))
    await try1('historicalBulkTrafficEstimation', () => historicalBulkTrafficEstimation(instanceId, [domain]))
    if (scope.competitors[0]) await try1('domainIntersection(gap)', () => domainIntersection(instanceId, scope.competitors[0], domain, { intersections: false, limit: 20 }))

    // AI Optimization — the field-name unknowns
    await try1('aiKeywordSearchVolume', () => aiKeywordSearchVolume(instanceId, [kw], { languageCode: 'he' }))
    await try1('llmMentionsAggregated', () => llmMentionsAggregated(instanceId, { domains: [domain], languageCode: 'he' }))
    await try1('llmResponse(chat_gpt)', () => llmResponse(instanceId, 'chat_gpt', `המלצה על ${kw} בישראל`, { webSearch: true }))

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })