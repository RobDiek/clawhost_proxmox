/**
 * Ads Recommendations Runner — weekly autonomous sweep.
 *
 * For every agent with Google Ads connected, evaluate Google's recommendation
 * feed against our strategy + data maturity and emit/refresh an approval task
 * ("ads_recommendations_review"). The user approves → applyRecommendationByResource
 * applies the chosen ones. Bidding recs auto-defer until conversion data matures.
 */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import type { MatehAgentRow } from '@/services/agentContext'
import { evaluateAdsRecommendations } from '@/services/adsRecommendationsEvaluator'

const RUN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000   // weekly
let started = false

export async function runAllAdsRecommendations(): Promise<{ agents: number; tasks: number; errors: number }> {
    let agents = 0, tasks = 0, errors = 0
    let rows: MatehAgentRow[] = []
    try { rows = await db.select().from(matehAgents) as MatehAgentRow[] }
    catch (e) { console.error('[adsRecRunner] load agents failed:', (e as Error).message); return { agents, tasks, errors: 1 } }

    for (const agent of rows) {
        const cfg: any = agent.googleAdsConfig || {}
        if (!cfg.customerId || !cfg.developerToken) continue   // Ads not connected
        agents++
        try {
            // Skip if a still-pending review task already exists (don't spam).
            const existing = await db.select().from(agentOutputs).where(and(
                eq(agentOutputs.agentId, agent.id),
                eq(agentOutputs.outputType, 'ads_recommendations_review'),
                eq(agentOutputs.status, 'pending_review'),
            ))
            const r = await evaluateAdsRecommendations(agent, { createTask: existing.length === 0 })
            if (r.error) { errors++; console.warn(`[adsRecRunner] ${agent.id}: ${r.error}`); continue }
            if (r.taskId) tasks++
        } catch (e) { errors++; console.error(`[adsRecRunner] ${agent.id} threw:`, (e as Error).message) }
    }
    console.log(`[adsRecRunner] swept ${agents} Ads agents · ${tasks} new review tasks · errors ${errors}`)
    return { agents, tasks, errors }
}

export function startAdsRecommendationsRunner(): void {
    if (started) return
    started = true
    console.log(`[adsRecRunner] starting (interval ${RUN_INTERVAL_MS / 3600_000}h)`)
    setTimeout(() => { runAllAdsRecommendations().catch(() => { /* logged inside */ }) }, 8 * 60 * 1000)
    setInterval(() => { runAllAdsRecommendations().catch(() => { /* logged inside */ }) }, RUN_INTERVAL_MS)
}