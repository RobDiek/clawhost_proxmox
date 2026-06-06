/**
 * SEO + AEO tracking runner — weekly + monthly DataForSEO collection per the
 * tenant's opt-in config, with a tracking-specific monthly cap.
 *
 * Cadence (gated inside a daily tick):
 *   WEEKLY  (Sun UTC): rankTracking, perKeywordSerp, trafficTracking, llmMentions
 *   MONTHLY (1st UTC): keywordGap, aiKeywordData, llmResponses (multi-engine probe)
 *
 * Cap/billing: before each feature we forecast its cost; if month-to-date
 * tracking spend + forecast would exceed config.monthlyCapUsdCents we SKIP it
 * (status → paused_cap). Every DFS call also debits the global per-tenant
 * balance (client.ts); insufficient_balance/global-cap → status paused_balance,
 * stop the tenant for this run. Actual cost (envelope.cost) is what we record.
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { MatehAgentRow } from '@/services/agentContext'
import { DfsError } from '@/services/research/dataforseo/client'
import {
    domainRankOverview, historicalRankOverview, historicalBulkTrafficEstimation,
    domainIntersection, serpAdvanced,
} from '@/services/research/dataforseo/endpoints'
import {
    llmMentionsAggregated, llmMentionsTopDomains, aiKeywordSearchVolume, llmResponse,
} from '@/services/research/dataforseo/aiOptimization'
import { UNIT_USD } from '@/services/research/dataforseo/costEstimator'
import {
    readSeoTracking, updateSeoTracking, deriveScope, monthKey, monthSpendUsd,
    withSeriesPoint, withSpend, type SeoTrackingState,
} from '@/services/seoTracking'

const todayIso = () => new Date().toISOString().slice(0, 10)

interface RunSummary { agentId: string; ran: string[]; skipped: string[]; spentUsd: number; status: string }

/** Extract our domain's organic position (1-based) from a SERP result; null if not in results. */
function positionInSerp(serp: any, domain: string): number | null {
    const d = domain.replace(/^www\./, '')
    for (const it of (serp?.items || [])) {
        if (it?.type === 'organic') {
            const itemDomain = String(it.domain || '').replace(/^www\./, '')
            if (itemDomain === d || itemDomain.endsWith('.' + d) || d.endsWith('.' + itemDomain)) {
                return Number(it.rank_absolute || it.rank_group) || null
            }
        }
    }
    return null
}

/**
 * Run tracking for one agent. `force` ignores cadence gating (manual/test run).
 */
export async function runSeoTrackingForAgent(
    agent: MatehAgentRow,
    opts: { force?: boolean; weekly?: boolean; monthly?: boolean } = {},
): Promise<RunSummary> {
    const instanceId = agent.vpsInstanceId
    let state = readSeoTracking(agent)
    const ran: string[] = [], skipped: string[] = []
    let spentUsd = 0
    const summary = (): RunSummary => ({ agentId: agent.id, ran, skipped, spentUsd, status: state.status })

    if (!state.config.enabled) { skipped.push('disabled'); return summary() }

    const now = new Date()
    const dow = now.getUTCDay()           // 0 = Sun
    const dom = now.getUTCDate()
    const doWeekly = opts.force || opts.weekly || dow === 0
    const doMonthly = opts.force || opts.monthly || dom === 1
    if (!doWeekly && !doMonthly) { skipped.push('off-cadence'); return summary() }

    // refresh scope from current strategy (keeps tracked keywords/competitors current)
    const scope = state.scope.domain ? state.scope : deriveScope(agent)
    if (!scope.domain) { skipped.push('no_domain'); return summary() }

    const cap = state.config.monthlyCapUsdCents
    const mk = monthKey(todayIso())
    const capOkFor = (estimateUsd: number): boolean => {
        if (cap == null) return true
        const spentCents = monthSpendUsd(state, mk) * 100
        return spentCents + estimateUsd * 100 <= cap
    }
    // record actual cost into state + running totals
    const charge = (usd: number) => { spentUsd += usd; state = withSpend(state, todayIso(), usd) }

    // run a feature with cap-precheck + balance-pause handling. `est` = forecast USD.
    const feature = async (name: string, est: number, fn: () => Promise<number>): Promise<boolean> => {
        if (!capOkFor(est)) { skipped.push(`${name} (cap)`); state.status = 'paused_cap'; state.statusReason = `monthly tracking cap reached`; return false }
        try {
            const cost = await fn()
            charge(cost)
            ran.push(name)
            return true
        } catch (e) {
            if (e instanceof DfsError && (e.kind === 'insufficient_balance' || e.kind === 'monthly_cap_exceeded' || e.kind === 'no_credits')) {
                state.status = 'paused_balance'; state.statusReason = e.userMessage
                skipped.push(`${name} (balance)`)
                throw new StopTenant()   // halt remaining features for this tenant
            }
            console.warn(`[seoTracking] ${agent.id} ${name} failed:`, (e as Error).message)
            skipped.push(`${name} (error)`)
            return false
        }
    }

    try {
        if (doWeekly) {
            const cfg = state.config
            if (cfg.rankTracking) {
                await feature('rankTracking', 2 * UNIT_USD.domain_rank_overview, async () => {
                    const ov = await domainRankOverview(instanceId, scope.domain)
                    const hist = await historicalRankOverview(instanceId, scope.domain)
                    const m = (ov.items[0] || {}) as any
                    const metrics = m.metrics?.organic || m.organic || m
                    state = withSeriesPoint(state, 'ranks', {
                        date: todayIso(),
                        etv: Number(metrics?.etv) || undefined,
                        pos_1_3: Number(metrics?.pos_1 ?? metrics?.pos_1_3) || undefined,
                        pos_4_10: Number(metrics?.pos_4_10) || undefined,
                        pos_11_100: Number(metrics?.pos_11_20 ?? metrics?.pos_11_100) || undefined,
                        keywordsCount: Number(metrics?.count) || undefined,
                    })
                    return ov.cost + hist.cost
                })
            }
            if (cfg.perKeywordSerp && scope.keywords.length) {
                await feature('perKeywordSerp', scope.keywords.length * UNIT_USD.serp_advanced, async () => {
                    const byKeyword: Record<string, number | null> = {}
                    let cost = 0
                    for (const kw of scope.keywords) {
                        const r = await serpAdvanced(instanceId, kw)
                        cost += r.cost
                        byKeyword[kw] = positionInSerp(r.items?.[0], scope.domain)
                    }
                    state = withSeriesPoint(state, 'keywordPositions', { date: todayIso(), byKeyword })
                    return cost
                })
            }
            if (cfg.trafficTracking) {
                await feature('trafficTracking', UNIT_USD.historical_bulk_traffic_estimation, async () => {
                    const r = await historicalBulkTrafficEstimation(instanceId, [scope.domain])
                    const it = (r.items[0] || {}) as any
                    const etv = Number(it?.metrics?.organic?.etv ?? it?.etv) || undefined
                    state = withSeriesPoint(state, 'traffic', { date: todayIso(), etv })
                    return r.cost
                })
            }
            if (cfg.llmMentions) {
                await feature('llmMentions', 2 * UNIT_USD.llm_mentions, async () => {
                    const agg = await llmMentionsAggregated(instanceId, { domains: [scope.domain], languageCode: 'he' })
                    let cost = agg.cost
                    if (scope.keywords.length) {
                        const top = await llmMentionsTopDomains(instanceId, { keywords: scope.keywords.slice(0, 20), languageCode: 'he' })
                        cost += top.cost
                    }
                    const totals = agg.entries.reduce((a, e) => ({ c: a.c + e.citationCount, m: a.m + e.mentionCount }), { c: 0, m: 0 })
                    state = withSeriesPoint(state, 'aiMentions', {
                        date: todayIso(), totalCitations: totals.c, totalMentions: totals.m,
                        perEngine: agg.entries[0]?.perEngine,
                        aiSearchVolume: agg.entries[0]?.aiSearchVolume,
                    })
                    return cost
                })
            }
            state.spend.lastWeeklyRun = todayIso()
        }

        if (doMonthly) {
            const cfg = state.config
            if (cfg.keywordGap && scope.competitors.length) {
                await feature('keywordGap', scope.competitors.length * UNIT_USD.domain_intersection, async () => {
                    let cost = 0
                    for (const comp of scope.competitors) {
                        // keywords the competitor ranks for that WE don't (gap)
                        const r = await domainIntersection(instanceId, comp, scope.domain, { intersections: false, limit: 100 })
                        cost += r.cost
                    }
                    return cost
                })
            }
            if (cfg.aiKeywordData && scope.keywords.length) {
                await feature('aiKeywordData', UNIT_USD.ai_keyword_data, async () => {
                    const r = await aiKeywordSearchVolume(instanceId, scope.keywords, { languageCode: 'he' })
                    return r.cost
                })
            }
            if (cfg.llmResponses && scope.llmPrompts.length && cfg.engines.length) {
                const est = scope.llmPrompts.length * cfg.engines.length * 0.05
                await feature('llmResponses', est, async () => {
                    let cost = 0
                    const perEngine: Record<string, { brandCited: number; competitorsCited: number; prompts: number }> = {}
                    for (const eng of cfg.engines) {
                        let brandCited = 0, compCited = 0
                        for (const prompt of scope.llmPrompts) {
                            const r = await llmResponse(instanceId, eng, prompt, { webSearch: true })
                            cost += r.cost
                            for (const item of r.items) {
                                const cited = item.citations.map(c => c.url.toLowerCase())
                                if (cited.some(u => u.includes(scope.domain.toLowerCase()))) brandCited++
                                if (scope.competitors.some(c => cited.some(u => u.includes(c.toLowerCase())))) compCited++
                            }
                        }
                        perEngine[eng] = { brandCited, competitorsCited: compCited, prompts: scope.llmPrompts.length }
                    }
                    state = withSeriesPoint(state, 'aiResponses', { date: todayIso(), perEngine })
                    return cost
                })
            }
            state.spend.lastMonthlyRun = todayIso()
        }

        if (state.status !== 'paused_cap') state.status = 'active'
    } catch (e) {
        if (!(e instanceof StopTenant)) {
            console.error(`[seoTracking] ${agent.id} run crashed:`, (e as Error).message)
        }
        // state.status already set to paused_balance inside feature()
    }

    state.scope = scope
    await updateSeoTracking(agent, instanceId, () => state)
    return summary()
}

class StopTenant extends Error {}

/** Daily tick — sweeps all agents with tracking enabled; cadence gated per-agent. */
export async function runSeoTracking(): Promise<void> {
    const agents = await db.select().from(matehAgents) as MatehAgentRow[]
    for (const agent of agents) {
        try {
            const s = readSeoTracking(agent)
            if (!s.config.enabled) continue
            const summary = await runSeoTrackingForAgent(agent)
            if (summary.ran.length || summary.skipped.some(x => x.includes('cap') || x.includes('balance'))) {
                console.log(`[seoTracking] ${agent.id}: ran=[${summary.ran.join(',')}] skipped=[${summary.skipped.join(',')}] spent=$${summary.spentUsd.toFixed(3)} status=${summary.status}`)
            }
        } catch (e) {
            console.error(`[seoTracking] sweep error for ${agent.id}:`, (e as Error).message)
        }
    }
}