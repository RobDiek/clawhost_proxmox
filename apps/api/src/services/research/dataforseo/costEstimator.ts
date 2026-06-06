/**
 * DataForSEO cost forecasting for the recurring SEO+AEO tracking add-on.
 *
 * Every tracking call debits the tenant's DFS balance at EXACT DFS-reported
 * cost (client.ts). This module forecasts the monthly bill BEFORE the tenant
 * opts in — so the UI can show "≈ $X/month" per feature and the tenant chooses.
 *
 * Prices below are per-call USD estimates (DFS list pricing, approximate). They
 * are intentionally tunable: after real runs we calibrate UNIT_USD against the
 * observed envelope.cost (recordObservedCost) so forecasts converge to reality.
 */
import type { LlmEngine } from './aiOptimization'

const WEEKS_PER_MONTH = 4.345

/** Per-call USD estimates. Calibratable — start from DFS list pricing. */
export const UNIT_USD: Record<string, number> = {
    domain_rank_overview: 0.02,
    historical_rank_overview: 0.02,
    historical_bulk_traffic_estimation: 0.02,
    serp_advanced: 0.002,            // per tracked keyword
    domain_intersection: 0.02,       // per competitor pair
    llm_mentions: 0.04,              // per aggregated/top call
    ai_keyword_data: 0.02,
    // LLM Responses — per prompt × engine; engine-specific (token-driven).
    'llm_responses.chat_gpt': 0.05,
    'llm_responses.claude': 0.05,
    'llm_responses.gemini': 0.04,
    'llm_responses.perplexity': 0.06,
}

export interface TrackingConfig {
    rankTracking: boolean            // domain rank overview + historical (weekly)
    perKeywordSerp: boolean          // per-target-keyword SERP position (weekly) — main driver
    trafficTracking: boolean         // historical bulk traffic (weekly)
    keywordGap: boolean              // domain_intersection vs competitors (monthly)
    aiKeywordData: boolean           // AI search-volume refresh (monthly)
    llmMentions: boolean             // weekly AEO citation/mention index
    llmResponses: boolean            // monthly multi-engine live probe
    engines: LlmEngine[]             // engines used for llmResponses
}

export interface TrackingScope {
    keywords: number                 // tracked keyword count
    competitors: number              // competitor count (for gap)
    llmPrompts: number               // JTBD prompts for the monthly probe
}

export interface CostLine { feature: string; callsPerMonth: number; unitUsd: number; monthlyUsd: number }
export interface CostForecast { weeklyUsd: number; monthlyUsd: number; lines: CostLine[]; note: string }

/** Forecast the monthly DFS bill for a tracking config + scope. */
export function forecastTrackingCost(cfg: TrackingConfig, scope: TrackingScope): CostForecast {
    const lines: CostLine[] = []
    const add = (feature: string, callsPerMonth: number, unitUsd: number) => {
        if (callsPerMonth <= 0) return
        lines.push({ feature, callsPerMonth: Math.round(callsPerMonth * 10) / 10, unitUsd, monthlyUsd: callsPerMonth * unitUsd })
    }

    if (cfg.rankTracking) {
        add('rank overview + historical (weekly)', 2 * WEEKS_PER_MONTH, UNIT_USD.domain_rank_overview)
    }
    if (cfg.perKeywordSerp && scope.keywords > 0) {
        add(`per-keyword SERP × ${scope.keywords} (weekly)`, scope.keywords * WEEKS_PER_MONTH, UNIT_USD.serp_advanced)
    }
    if (cfg.trafficTracking) {
        add('organic traffic estimate (weekly)', 1 * WEEKS_PER_MONTH, UNIT_USD.historical_bulk_traffic_estimation)
    }
    if (cfg.keywordGap && scope.competitors > 0) {
        add(`keyword gap × ${scope.competitors} competitors (monthly)`, scope.competitors, UNIT_USD.domain_intersection)
    }
    if (cfg.aiKeywordData) {
        add('AI keyword data (monthly)', 1, UNIT_USD.ai_keyword_data)
    }
    if (cfg.llmMentions) {
        // aggregated + top_domains per week
        add('LLM mentions index (weekly)', 2 * WEEKS_PER_MONTH, UNIT_USD.llm_mentions)
    }
    if (cfg.llmResponses && scope.llmPrompts > 0 && cfg.engines.length) {
        for (const eng of cfg.engines) {
            const unit = UNIT_USD[`llm_responses.${eng}`] ?? 0.05
            add(`LLM probe ${eng}: ${scope.llmPrompts} prompts (monthly)`, scope.llmPrompts, unit)
        }
    }

    const monthlyUsd = lines.reduce((s, l) => s + l.monthlyUsd, 0)
    return {
        weeklyUsd: monthlyUsd / WEEKS_PER_MONTH,
        monthlyUsd,
        lines,
        note: 'אומדן לפי תמחור DataForSEO. החיוב בפועל הוא לפי העלות המדויקת שמחזיר DFS לכל קריאה — ייתכנו סטיות קלות.',
    }
}

/** Default tracking config. NOTE: llmMentions defaults OFF — it requires a
 *  separate DataForSEO "LLM Mentions API" subscription (40204 until activated).
 *  AEO is covered by llmResponses (live multi-engine probe + citations) until
 *  the tenant activates Mentions, after which it can be toggled on. */
export function defaultTrackingConfig(): TrackingConfig {
    return {
        rankTracking: true,
        perKeywordSerp: true,
        trafficTracking: true,
        keywordGap: true,
        aiKeywordData: true,
        llmMentions: false,
        llmResponses: true,
        engines: ['chat_gpt', 'claude', 'gemini', 'perplexity'],
    }
}