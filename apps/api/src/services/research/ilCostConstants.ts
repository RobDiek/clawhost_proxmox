/**
 * Phase E3 — Israeli market SEO/AEO/content cost constants + time-to-rank
 * formulas. Single source of truth for the cost_timeline_modeling stage.
 *
 * Sources for these numbers (2024-2025 IL market data):
 *   - Hebrew copywriting rates: from leading IL agencies (Wix, Moshe Hadar)
 *     and freelancer marketplaces (XPlace, Frelans). 0.5-1.5 ₪/word for SMB-
 *     tier writers, 1.5-3.0 ₪/word for senior subject-matter experts.
 *   - Link-building costs: Authority Hacker / Ahrefs 2024 surveys + IL-
 *     specific outreach quotes from 5 IL agencies.
 *   - SEO labor rates: Israeli SEO consultants charge 200-400 ₪/hour
 *     depending on seniority. Agencies bill 250-450 ₪/hour effective.
 *   - Time-to-rank: Ahrefs 2024 study (median 9-12 months for new content
 *     to crack page 1, IL niches typically faster due to less competition).
 *
 * Numbers are conservative midpoints — the strategy_options stage adds risk
 * buffers when synthesizing the actual scenario.
 *
 * Update cadence: review quarterly. When updating, increment USD_TO_ILS_RATE
 * to reflect current spot — link costs are USD-denominated.
 */

// ─── Currency ─────────────────────────────────────────────────────────────

export const USD_TO_ILS_RATE = 3.65  // 2026 Q1 spot estimate

// ─── Hebrew content production rates (₪ per piece, mid-tier writer) ──────

export const HEBREW_CONTENT_RATES_ILS = {
    /** Short blog post — 500-700 words, light research, conversion-y. */
    blog_short: { words: 600, price: 380, hours: 4 },
    /** Standard blog/spoke — 1000-1500 words, real research + 2-3 sources. */
    blog_standard: { words: 1200, price: 850, hours: 8 },
    /** Long-form pillar — 2500-3500 words, deep research, original data. */
    pillar_longform: { words: 3000, price: 2400, hours: 18 },
    /** Local/landing page — 400-600 words + schema + CTA architecture. */
    landing_local: { words: 500, price: 480, hours: 5 },
    /** Product page (e-com) — 300-500 words + structured specs. */
    product_page: { words: 400, price: 280, hours: 3 },
    /** FAQ page — 12+ Q/A pairs, 800-1200 words total. */
    faq_page: { words: 1000, price: 580, hours: 6 },
    /** Comparison/review post — head-to-head 1500w + table + decision tree. */
    comparison_review: { words: 1500, price: 1100, hours: 10 },
    /** Case study — narrative 1200w + metrics + quotes. */
    case_study: { words: 1200, price: 950, hours: 9 },
    /** Refresh existing page — re-edit, expand 30-50%, add schema. */
    refresh_existing: { words: 0, price: 350, hours: 4 },
} as const

export type ContentPieceType = keyof typeof HEBREW_CONTENT_RATES_ILS

// ─── Link acquisition costs by Domain Rating tier (USD per link) ─────────

export const LINK_COSTS_USD = {
    /** DR 0-30: directory listings, junior outreach, niche guest posts. */
    DR_low: {
        avg_per_link_usd: 80,
        range_usd: [40, 200] as const,
        outreach_response_rate: 0.15,         // % of pitches that result in a link
        emails_per_link: 12,                  // 1 / response_rate × 1.8 quality factor
        time_per_link_minutes: 90,            // research + email + follow-ups
    },
    /** DR 30-50: industry blogs, mid-tier guest posts, expert roundups. */
    DR_mid: {
        avg_per_link_usd: 280,
        range_usd: [150, 500] as const,
        outreach_response_rate: 0.08,
        emails_per_link: 25,
        time_per_link_minutes: 180,
    },
    /** DR 50-70: top-tier blogs, business outlets, premium guest posts. */
    DR_high: {
        avg_per_link_usd: 850,
        range_usd: [400, 1500] as const,
        outreach_response_rate: 0.03,
        emails_per_link: 60,
        time_per_link_minutes: 360,
    },
    /** DR 70+: tier-1 publications (Calcalist, Globes, ynet level). */
    DR_premium: {
        avg_per_link_usd: 3500,
        range_usd: [1500, 8000] as const,
        outreach_response_rate: 0.01,
        emails_per_link: 200,
        time_per_link_minutes: 1200,
    },
} as const

export type LinkTier = keyof typeof LINK_COSTS_USD

// ─── Labor rates (₪ per hour, IL market 2026) ────────────────────────────

export const LABOR_RATES_ILS_PER_HOUR = {
    /** SEO strategist / consultant — strategy + audits */
    seo_strategist: 350,
    /** Content writer (Hebrew, mid-tier) */
    content_writer_he: 180,
    /** Senior content writer (subject-matter expert, 5+ yrs) */
    content_writer_senior: 280,
    /** Technical SEO / dev — schema, redirects, CWV fixes */
    tech_seo_dev: 250,
    /** Outreach specialist (junior) */
    outreach_jr: 120,
    /** Outreach specialist (senior, gets responses from premium tiers) */
    outreach_senior: 200,
    /** PM / coordinator overhead */
    pm_coordinator: 220,
} as const

// ─── Tooling subscription costs (₪/month) ────────────────────────────────

export const TOOLING_RATES_ILS_PER_MONTH = {
    dataforseo_seo_pro: 200,        // typical monthly DFS spend for 1 active client
    dataforseo_with_backlinks: 450, // adds Backlinks API ~$70 USD
    firecrawl_pro: 110,             // 30 USD/mo
    semrush_or_ahrefs_alt: 1450,    // 400 USD/mo equivalent
    pm_tools: 150,
} as const

// ─── Platform-DIY (OpenClaw + agents) — 2026 reality ──────────────────────
//
// Phase QA round-8 (strategic-fit fix) — when the user runs research+ops via
// our platform, "labor" cost (content_production / seo_strategist /
// technical_seo / link_outreach hours / tooling_subscriptions) collapses
// to ~zero marginal cost — agents do the work. The user's ACTUAL recurring
// spend is:
//
//   1. Platform subscription (the OpenClaw VPS plan)
//   2. Anthropic API (user-provided key — token usage by agents)
//   3. Backlink acquisition (real placement money — agents draft outreach
//      but the link itself still costs, e.g. paid guest post fees, premium
//      directory listings, expert mentions)
//   4. Paid ads (only in Aggressive — Google Ads / Meta budgets)
//   5. External tooling (rarely needed — DFS/Firecrawl/Anthropic bundled)
//
// We expose `agency_comparison_ils` as a SIDE-BLOCK so narrative can frame
// "this would have cost ₪X/mo at agency rates pre-2025" — not as the
// user's actual budget.

export const PLATFORM_TIERS_ILS_PER_MONTH = {
    personal:  79,    // 4GB RAM — single OpenClaw Personal agent
    business:  169,   // 8GB RAM — MATEH (3GB) + n8n/Activepieces ✓ default for most
    pro:       349,   // 16GB dedicated — heavy automation, multi-agent
    developer: 599,   // 32GB dedicated — Ollama local + multi-tenant
} as const

export type PlatformTier = keyof typeof PLATFORM_TIERS_ILS_PER_MONTH

// Anthropic API usage estimates (₪/month) — agent activity at the
// platform layer. Calibrated from MATEH-style continuous monitoring +
// content gen + outreach drafts. Smart/Aggressive scale with cadence.
//
// Smart cadence: daily brief + 8-10 content pieces/mo + 30 outreach drafts
// Aggressive cadence: daily brief × 2 (pre-market + post-market) + 20-30
// pieces + 80 outreach drafts + research refresh monthly + ad creative gen
export const ANTHROPIC_API_ESTIMATES_ILS_PER_MONTH = {
    smart:      350,   // ~$95/mo @ 3.65 ILS/USD — Opus for high-stakes, Sonnet for routine
    aggressive: 1300,  // ~$355/mo — heavier Opus usage, more pieces, more frequent runs
} as const

// Backlink real-money costs (without outreach labor — agents draft).
// Per-month budget for active link acquisition, factored into avg link
// price × velocity per scenario.
export const BACKLINK_BUDGET_ILS_PER_MONTH = {
    smart:      1000,  // ~2-3 mid-DR links/mo at ₪400-500 each (agent drafts, user pays placement)
    aggressive: 3000,  // 5-8 links/mo incl. some premium tier outreach
} as const

// Paid ads budgets (₪/month) — IL market floors. Smart = organic-first,
// no paid. Aggressive = Google Ads + retargeting backbone for first ~12 mo.
export const PAID_ADS_BUDGET_ILS_PER_MONTH = {
    smart_default:      0,
    smart_optional:     1500,  // if user opts to test paid for first 90d
    aggressive_default: 5000,  // ~₪165/day Google Ads + ~₪500/wk retargeting
    aggressive_premium: 8000,
} as const

// External tooling NOT bundled by the platform (rare — DFS/Firecrawl
// already proxied; Anthropic via user key). Most users hit ₪0; aggressive
// scenarios may add manual deep-dive tools occasionally.
export const EXTERNAL_TOOLING_ILS_PER_MONTH = {
    smart_default:      0,
    aggressive_default: 500,   // occasional Ahrefs/Screaming Frog seat or paid SaaS audit
} as const

/**
 * Compute the platform-DIY monthly budget for a given scenario. Returns
 * breakdown + total. This is what the user ACTUALLY pays — the labor
 * costs in `estimateContentBudgetIls` / `estimateLinkBudgetIls` /
 * LABOR_RATES are ONLY used for `agency_comparison_ils` side-block.
 */
export function estimatePlatformDiyBudget(scenario: 'smart' | 'aggressive', opts?: {
    tier?: PlatformTier
    paidAdsOverrideIls?: number
}): {
    platform_subscription: number
    anthropic_api: number
    backlink_acquisition: number
    paid_ads: number
    external_tooling: number
    total: number
} {
    const tier: PlatformTier = opts?.tier ?? (scenario === 'aggressive' ? 'pro' : 'business')
    const platform = PLATFORM_TIERS_ILS_PER_MONTH[tier]
    const anthropic = ANTHROPIC_API_ESTIMATES_ILS_PER_MONTH[scenario]
    const backlinks = BACKLINK_BUDGET_ILS_PER_MONTH[scenario]
    const paid = opts?.paidAdsOverrideIls ?? (scenario === 'aggressive' ? PAID_ADS_BUDGET_ILS_PER_MONTH.aggressive_default : PAID_ADS_BUDGET_ILS_PER_MONTH.smart_default)
    const tooling = scenario === 'aggressive' ? EXTERNAL_TOOLING_ILS_PER_MONTH.aggressive_default : EXTERNAL_TOOLING_ILS_PER_MONTH.smart_default
    return {
        platform_subscription: platform,
        anthropic_api: anthropic,
        backlink_acquisition: backlinks,
        paid_ads: paid,
        external_tooling: tooling,
        total: platform + anthropic + backlinks + paid + tooling,
    }
}

// ─── Time-to-rank model (months) ─────────────────────────────────────────

/**
 * Compute expected months for a target keyword/cluster to reach top 3.
 *
 * Model:
 *   t = base_eval_months + max(authority_gap_months, content_gap_months) + risk_buffer
 *
 * Notes:
 *   - DR climbs roughly 1-2 points/month with consistent outreach (Authority
 *     Hacker 2024 cohort study); use 1.5 average → days ≈ gap × 0.66 months.
 *   - Content velocity assumes 1 dedicated writer producing 4 standard +
 *     1 long-form per month (≈ 5-6 pieces).
 *   - Risk buffer: IL niches add 1-2 months variance for SERP volatility.
 *
 * Returns months as a 3-point estimate (min/expected/max).
 */
export interface TimeToRankInputs {
    /** Our current Domain Rating (0-100). */
    our_dr: number
    /** Target competitor's DR we need to match. */
    target_dr: number
    /** New content pieces required (sum of pillars + spokes + supporting). */
    content_pieces_total: number
    /** Production velocity (pieces/month) — depends on team size + budget. */
    content_velocity_per_month: number
    /** Existing pages striking-distance (positions 4-20) we need to upgrade. */
    striking_distance_count: number
    /** Whether IL niche is highly competitive (storage / law / health = high). */
    competition_level: 'low' | 'medium' | 'high'
}

export function computeTimeToRank(input: TimeToRankInputs): { min: number; expected: number; max: number } {
    const baseEvalMonths = 3
    const authorityGapMonths = Math.max(0, Math.ceil((input.target_dr - input.our_dr) / 1.5))
    const contentGapMonths = Math.max(
        0,
        Math.ceil(input.content_pieces_total / Math.max(1, input.content_velocity_per_month)),
    )
    // Striking distance is fast — they're already indexed, just need a refresh
    // + small link push. Add half a month per 5 pages parallel to content work.
    const strikingDistanceParallel = Math.ceil(input.striking_distance_count / 10)

    const heavierWork = Math.max(authorityGapMonths, contentGapMonths)
    const expected = baseEvalMonths + heavierWork + strikingDistanceParallel

    // Competition multiplier
    const compMult = input.competition_level === 'high' ? 1.4
        : input.competition_level === 'medium' ? 1.15
        : 1.0
    const expectedAdjusted = Math.round(expected * compMult)

    return {
        min: Math.max(3, Math.round(expectedAdjusted * 0.7)),
        expected: expectedAdjusted,
        max: Math.round(expectedAdjusted * 1.6),
    }
}

// ─── Budget calculator helpers ───────────────────────────────────────────

export function estimateContentBudgetIls(pieces: Partial<Record<ContentPieceType, number>>): {
    total_ils: number
    total_hours: number
    breakdown: Array<{ type: ContentPieceType; count: number; subtotal_ils: number; hours: number }>
} {
    const breakdown: Array<{ type: ContentPieceType; count: number; subtotal_ils: number; hours: number }> = []
    let total_ils = 0
    let total_hours = 0
    for (const [type, count] of Object.entries(pieces) as Array<[ContentPieceType, number]>) {
        if (!count || count <= 0) continue
        const rate = HEBREW_CONTENT_RATES_ILS[type]
        const subtotal_ils = rate.price * count
        const hours = rate.hours * count
        total_ils += subtotal_ils
        total_hours += hours
        breakdown.push({ type, count, subtotal_ils, hours })
    }
    return { total_ils, total_hours, breakdown }
}

export function estimateLinkBudgetIls(linksByTier: Partial<Record<LinkTier, number>>): {
    total_ils: number
    total_outreach_hours: number
    breakdown: Array<{ tier: LinkTier; count: number; subtotal_ils: number; outreach_hours: number; outreach_emails: number }>
} {
    const breakdown: Array<{ tier: LinkTier; count: number; subtotal_ils: number; outreach_hours: number; outreach_emails: number }> = []
    let total_ils = 0
    let total_outreach_hours = 0
    for (const [tier, count] of Object.entries(linksByTier) as Array<[LinkTier, number]>) {
        if (!count || count <= 0) continue
        const tierConfig = LINK_COSTS_USD[tier]
        const subtotal_usd = tierConfig.avg_per_link_usd * count
        const subtotal_ils = subtotal_usd * USD_TO_ILS_RATE
        const outreach_hours = (tierConfig.time_per_link_minutes * count) / 60
        const outreach_emails = tierConfig.emails_per_link * count
        total_ils += subtotal_ils
        total_outreach_hours += outreach_hours
        breakdown.push({ tier, count, subtotal_ils, outreach_hours, outreach_emails })
    }
    return { total_ils, total_outreach_hours, breakdown }
}