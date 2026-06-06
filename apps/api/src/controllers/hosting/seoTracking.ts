/**
 * SEO + AEO tracking — per-tenant opt-in config, cost forecast, manual run.
 *
 * Costs fall on the tenant (DFS balance), so the UI shows a per-feature $/month
 * forecast and the tenant enables only what they want, under a monthly cap.
 *
 * Routes (registered in hosting router):
 *   GET  /integrations/seo-tracking            → config + status + scope + forecast
 *   POST /integrations/seo-tracking            → update config (features/engines/cap/enabled)
 *   POST /integrations/seo-tracking/forecast   → forecast an arbitrary config (preview, no save)
 *   POST /integrations/seo-tracking/run        → run now (force) — for testing/manual refresh
 *   POST /integrations/seo-tracking/report-card→ generate the monthly report card now
 */
import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { resolveActiveAgent } from '@/services/agentContext'
import { readSeoTracking, updateSeoTracking, deriveScope, type SeoTrackingConfig } from '@/services/seoTracking'
import { forecastTrackingCost, type TrackingConfig, type TrackingScope } from '@/services/research/dataforseo/costEstimator'
import type { LlmEngine } from '@/services/research/dataforseo/aiOptimization'

const VALID_ENGINES: LlmEngine[] = ['chat_gpt', 'claude', 'gemini', 'perplexity']

function scopeCounts(s: { keywords: string[]; competitors: string[]; llmPrompts: string[]; domain: string }): TrackingScope & { domain: string } {
    return { domain: s.domain, keywords: s.keywords.length, competitors: s.competitors.length, llmPrompts: s.llmPrompts.length }
}

export const getSeoTracking = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const agent = await resolveActiveAgent(c, instanceId)
        if (!agent) return fail(c, 'Agent not found', 404)

        const state = readSeoTracking(agent)
        const scope = state.scope.domain ? state.scope : deriveScope(agent)
        const sc = scopeCounts(scope)
        const forecast = forecastTrackingCost(state.config, sc)
        return ok(c, {
            config: state.config,
            status: state.status,
            statusReason: state.statusReason,
            scope: sc,
            spend: state.spend,
            seriesCounts: {
                ranks: state.series.ranks.length,
                keywordPositions: state.series.keywordPositions.length,
                traffic: state.series.traffic.length,
                aiMentions: state.series.aiMentions.length,
                aiResponses: state.series.aiResponses.length,
            },
            forecast,
            engineOptions: VALID_ENGINES,
        })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

function sanitizeConfig(body: any, prev: SeoTrackingConfig): SeoTrackingConfig {
    const b = body?.config || body || {}
    const bool = (v: any, d: boolean) => typeof v === 'boolean' ? v : d
    const engines: LlmEngine[] = Array.isArray(b.engines)
        ? b.engines.filter((e: any) => VALID_ENGINES.includes(e))
        : prev.engines
    let cap: number | null = prev.monthlyCapUsdCents
    if (body?.monthlyCapUsdCents !== undefined) {
        const n = Number(body.monthlyCapUsdCents)
        cap = Number.isFinite(n) && n > 0 ? Math.round(n) : null
    }
    return {
        rankTracking: bool(b.rankTracking, prev.rankTracking),
        perKeywordSerp: bool(b.perKeywordSerp, prev.perKeywordSerp),
        trafficTracking: bool(b.trafficTracking, prev.trafficTracking),
        keywordGap: bool(b.keywordGap, prev.keywordGap),
        aiKeywordData: bool(b.aiKeywordData, prev.aiKeywordData),
        llmMentions: bool(b.llmMentions, prev.llmMentions),
        llmResponses: bool(b.llmResponses, prev.llmResponses),
        engines,
        enabled: bool(body?.enabled, prev.enabled),
        monthlyCapUsdCents: cap,
        optedInAt: prev.optedInAt,
    }
}

export const setSeoTracking = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const agent = await resolveActiveAgent(c, instanceId)
        if (!agent) return fail(c, 'Agent not found', 404)
        let body: any = {}
        try { body = await c.req.json() } catch { /* empty */ }

        const prev = readSeoTracking(agent)
        const newCfg = sanitizeConfig(body, prev.config)
        const becameEnabled = newCfg.enabled && !prev.config.enabled
        if (becameEnabled) newCfg.optedInAt = new Date().toISOString()

        await updateSeoTracking(agent, instanceId, (s) => ({
            ...s,
            config: newCfg,
            scope: s.scope.domain ? s.scope : deriveScope(agent),
            status: newCfg.enabled ? (s.status === 'paused_balance' || s.status === 'paused_cap' ? s.status : 'active') : 'disabled',
        }))

        const scope = prev.scope.domain ? prev.scope : deriveScope(agent)
        const forecast = forecastTrackingCost(newCfg, scopeCounts(scope))
        return ok(c, { config: newCfg, forecast, status: newCfg.enabled ? 'active' : 'disabled' }, 'Tracking config saved')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const previewSeoTrackingCost = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const agent = await resolveActiveAgent(c, instanceId)
        if (!agent) return fail(c, 'Agent not found', 404)
        let body: any = {}
        try { body = await c.req.json() } catch { /* empty */ }
        const cfg = sanitizeConfig(body, readSeoTracking(agent).config) as TrackingConfig
        const scope = deriveScope(agent)
        const forecast = forecastTrackingCost(cfg, scopeCounts(scope))
        return ok(c, { forecast, scope: scopeCounts(scope) })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const runSeoTrackingNow = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const agent = await resolveActiveAgent(c, instanceId)
        if (!agent) return fail(c, 'Agent not found', 404)
        const { runSeoTrackingForAgent } = await import('@/services/seoTrackingRunner')
        let body: any = {}
        try { body = await c.req.json() } catch { /* empty */ }
        const summary = await runSeoTrackingForAgent(agent, { force: true, weekly: true, monthly: !!body?.monthly })
        return ok(c, summary, 'Tracking run complete')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const generateReportCardNow = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const agent = await resolveActiveAgent(c, instanceId)
        if (!agent) return fail(c, 'Agent not found', 404)
        const { generateMonthlyReportCard } = await import('@/services/monthlyReportCard')
        const r = await generateMonthlyReportCard(agent, instanceId)
        return ok(c, r, 'Report card generated')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}