/**
 * Pre-fetch (compute-only) for cost_timeline_modeling stage. Phase E3.
 *
 * Reads upstream:
 *   - competitor_landscape.records → top 5 competitors' authority + url + scorecard
 *   - competitor_landscape.our_link_profile → our_dr proxy
 *   - internal_seo_audit.records + tech_debt_summary → tech work hours
 *   - seo_keyword_research.records → take_now content pieces needed, intent split
 *   - seo_keyword_research.cluster_architecture → pillar/spoke counts
 *   - seo_keyword_research.content_briefs → existing briefs
 *   - aeo_visibility.schema_priority_plan → schema implementation hours
 *   - link_audit.records → link gap targets + tier guesses
 *
 * Outputs a CALIBRATED baseline (Smart + Aggressive) using IL constants +
 * formulas. Strategy_options stage downstream synthesizes the user-facing
 * scenarios on top of this, but the heavy math is done here so the AI
 * doesn't invent numbers.
 *
 * Why no DFS/Anthropic calls here: this is a pure compute step. Inputs are
 * all upstream stage outputs. Cost = $0. If upstream is missing, return
 * partial baseline + flag enrichmentMissing so the prompt downstream notes
 * the limitation.
 */

import {
    USD_TO_ILS_RATE,
    LABOR_RATES_ILS_PER_HOUR,
    TOOLING_RATES_ILS_PER_MONTH,
    PLATFORM_TIERS_ILS_PER_MONTH,
    estimatePlatformDiyBudget,
    computeTimeToRank,
    estimateContentBudgetIls,
    estimateLinkBudgetIls,
    type ContentPieceType,
    type LinkTier,
    type TimeToRankInputs,
} from '@/services/research/ilCostConstants'
import type { ResearchDataV2 } from '@/services/research/types'

export interface ScenarioBaseline {
    /** Internal scenario id */
    name: 'smart' | 'aggressive'
    /** Hebrew label for UI */
    label_he: string

    // ─ Inputs that drove this scenario ─
    inputs: {
        target_top_3_keyword_count: number
        content_pieces_total: number
        content_pieces_breakdown: Partial<Record<ContentPieceType, number>>
        links_total: number
        links_breakdown: Partial<Record<LinkTier, number>>
        tech_seo_hours: number
        striking_distance_count: number
        target_dr: number
        our_dr_estimate: number
        competition_level: 'low' | 'medium' | 'high'
    }

    // ─ Platform-DIY breakdown — what the user ACTUALLY pays (Phase QA round-8) ─
    // The platform (OpenClaw + MATEH agents) collapses 90% of agency labor
    // (content production, technical SEO, strategy, outreach drafting) into
    // ~zero marginal cost. Real recurring spend is platform sub + Anthropic
    // API + backlink placement money + paid ads (if any) + rare external tools.
    monthly_budget_ils: {
        platform_subscription: number
        anthropic_api: number
        backlink_acquisition: number
        paid_ads: number
        external_tooling: number
        total: number
    }
    duration_months: { min: number; expected: number; max: number }
    /** total_program_ils = monthly_budget × duration_months.expected */
    total_program_ils: number

    // ─ Agency comparison side-block — for narrative value-prop framing only.
    // "If you went the agency route pre-2025, this same scope would have
    // cost ₪X/mo." NOT the user's actual budget — purely for context.
    agency_comparison_ils: {
        content_production: number
        link_outreach_labor: number
        technical_seo: number
        seo_strategist: number
        tooling_subscriptions: number
        total_monthly: number
        total_program: number
        savings_vs_diy_total: number
    }

    // ─ Detailed projections per month ─
    monthly_kpis: Array<{
        month: number
        new_pieces_published: number
        cumulative_pieces: number
        new_links: number
        cumulative_links: number
        expected_top_10_count: number   // ramp from striking distance + new content
        expected_top_3_count: number    // backloaded — earned via authority + content
        expected_organic_clicks: number // function of (top 10 keywords × volume × CTR_curve)
    }>

    // ─ Underlying model trace for transparency ─
    model_trace: {
        time_to_rank_inputs: TimeToRankInputs
        content_velocity_per_month: number
        outreach_emails_total: number
        outreach_hours_total: number
        risk_factors: string[]
    }
}

export interface CostTimelineModelingDfsData {
    upstreamMissing: string[]
    /** Light context summary about the business, derived from competitor_landscape */
    business_context: {
        our_domain: string | null
        our_dr_estimate: number
        top_competitor_dr: number
        top_competitor_link_count: number
        competition_level: 'low' | 'medium' | 'high'
        target_top_3_count_smart: number
        target_top_3_count_aggressive: number
    }
    /** Two pre-computed scenarios — strategy_options refines from here */
    scenarios: {
        smart: ScenarioBaseline
        aggressive: ScenarioBaseline
    }
    /** Constants used (echoed for transparency) */
    constants_snapshot: {
        usd_to_ils: number
        platform_business_tier_ils_per_month: number
        platform_pro_tier_ils_per_month: number
        seo_strategist_ils_per_hour: number
        content_writer_ils_per_hour: number
        tech_seo_ils_per_hour: number
        outreach_jr_ils_per_hour: number
        tooling_typical_ils_per_month: number
    }
}

export async function prefetchCostTimelineModeling(
    instanceId: string,
    rd: ResearchDataV2,
): Promise<CostTimelineModelingDfsData> {
    void instanceId  // no DFS calls
    const upstreamMissing: string[] = []

    // ─── Read upstream signals ──
    const compLand = rd.results?.competitor_landscape
    const compRecords = (compLand?.records as Array<Record<string, unknown>> | undefined) || []
    if (compRecords.length === 0) upstreamMissing.push('competitor_landscape')

    const internalAudit = rd.results?.internal_seo_audit
    const techDebt = (internalAudit?.extras as Record<string, unknown> | undefined)?.tech_debt_summary as { total_hours_estimate?: number } | undefined
    const techDebtHours = typeof techDebt?.total_hours_estimate === 'number' ? techDebt.total_hours_estimate : null
    if (!internalAudit) upstreamMissing.push('internal_seo_audit')

    const kwResearch = rd.results?.seo_keyword_research
    const kwRecords = (kwResearch?.records as Array<Record<string, unknown>> | undefined) || []
    const kwExtras = (kwResearch?.extras as Record<string, unknown> | undefined) || {}
    const clusterArch = (kwExtras.cluster_architecture as Array<Record<string, unknown>> | undefined) || []
    if (kwRecords.length === 0) upstreamMissing.push('seo_keyword_research')

    const aeoVis = rd.results?.aeo_visibility
    const schemaPlan = (aeoVis?.extras as Record<string, unknown> | undefined)?.schema_priority_plan as Array<Record<string, unknown>> | undefined
    if (!aeoVis) upstreamMissing.push('aeo_visibility')

    const linkAudit = rd.results?.link_audit
    const linkRecords = (linkAudit?.records as Array<Record<string, unknown>> | undefined) || []
    if (!linkAudit) upstreamMissing.push('link_audit')

    // ─── Derive business context signals ──
    const ourDomain = inferOurDomain(rd)
    const ourDrEstimate = inferOurDr(compLand)
    const topCompetitorDr = inferTopCompetitorDr(compRecords)
    const topCompetitorLinks = inferTopCompetitorLinkCount(compRecords)
    const competitionLevel = inferCompetitionLevel(compRecords, kwRecords)

    // ─── Counts driving content production ──
    const takeNowCount = kwRecords.filter(r => {
        const opp = r.opportunity as Record<string, unknown> | undefined
        return opp?.decision === 'take_now'
    }).length
    const aeoPriorityCount = kwRecords.filter(r => {
        const aeo = r.aeo as Record<string, unknown> | undefined
        return aeo?.is_priority === true
    }).length
    const strikingDistanceCount = kwRecords.filter(r => {
        return typeof r.striking_bucket === 'string' && r.striking_bucket
    }).length
    const pillarCount = clusterArch.length          // 1 pillar per cluster
    const spokesPerCluster = clusterArch.map(c => {
        const spokes = c.spokes as Array<unknown> | undefined
        return Array.isArray(spokes) ? spokes.length : 4
    })
    const totalSpokeCount = spokesPerCluster.reduce((s, n) => s + n, 0)

    // ─── Schema implementation hours (from aeo_visibility) ──
    const schemaHours = (schemaPlan || []).reduce((sum, plan) => {
        const h = typeof plan.estimated_effort_hours === 'number' ? plan.estimated_effort_hours : 4
        return sum + h
    }, 0)

    // ─── Link counts (from link_audit) ──
    const linkAuditTotal = linkRecords.length
    // Heuristic tier split — without DR per-domain data we estimate:
    //   60% mid, 30% low, 10% high. Aggressive doubles high-tier share.
    const computeLinkTierSplit = (total: number, tilt: 'smart' | 'aggressive'): Partial<Record<LinkTier, number>> => {
        if (tilt === 'smart') {
            return {
                DR_low: Math.round(total * 0.4),
                DR_mid: Math.round(total * 0.5),
                DR_high: Math.round(total * 0.1),
                DR_premium: 0,
            }
        }
        return {
            DR_low: Math.round(total * 0.2),
            DR_mid: Math.round(total * 0.45),
            DR_high: Math.round(total * 0.25),
            DR_premium: Math.round(total * 0.1),
        }
    }

    // ─── Targets per scenario ──
    // Smart: long-tail focus — fewer keywords to top-3 but lower-CPC.
    // Aggressive: covers head + commercial + AEO priority — more comprehensive.
    const targetTop3Smart = Math.min(takeNowCount, 12)
    const targetTop3Aggressive = Math.max(20, takeNowCount + Math.ceil(aeoPriorityCount * 0.5))

    // ─── Build SMART scenario ──
    const smartContent: Partial<Record<ContentPieceType, number>> = {
        pillar_longform: Math.max(2, Math.ceil(pillarCount * 0.5)),
        blog_standard: Math.max(8, totalSpokeCount),
        landing_local: Math.max(0, Math.ceil(strikingDistanceCount * 0.3)),
        faq_page: Math.max(2, Math.ceil(aeoPriorityCount * 0.4)),
        refresh_existing: Math.max(0, strikingDistanceCount),
    }
    const smartContentBudget = estimateContentBudgetIls(smartContent)

    // Smart links: aim for parity with mid-tier competitor — fewer total
    // links, focus on relevance over authority.
    const smartLinkCount = Math.max(20, Math.min(40, linkAuditTotal || 30))
    const smartLinks = computeLinkTierSplit(smartLinkCount, 'smart')
    const smartLinkBudget = estimateLinkBudgetIls(smartLinks)

    const smartTechHours = (techDebtHours ?? 30) + schemaHours
    // Phase QA round-8 — agents 2-3x faster than human writer for IL
    // Hebrew content. Smart cadence: ~10 pieces/mo via MATEH content agent.
    const smartContentVelocity = 10
    const smartStrategistHours = 16 // (agency comparison only — 4 hrs/week)
    const smartOutreachHours = smartLinkBudget.total_outreach_hours

    const smartT2RInputs: TimeToRankInputs = {
        our_dr: ourDrEstimate,
        target_dr: Math.max(ourDrEstimate + 8, Math.round(topCompetitorDr * 0.7)),
        content_pieces_total: smartContentBudget.breakdown.reduce((s, b) => s + b.count, 0),
        content_velocity_per_month: smartContentVelocity,
        striking_distance_count: strikingDistanceCount,
        competition_level: competitionLevel,
    }
    const smartDuration = computeTimeToRank(smartT2RInputs)

    // Platform-DIY budget — what the user actually pays.
    const smartPlatformBudget = estimatePlatformDiyBudget('smart')
    const smartMonthlyTotal = smartPlatformBudget.total
    const smartTotalProgram = Math.round(smartMonthlyTotal * smartDuration.expected)

    // Agency comparison side-block — pre-2025 cost basis for narrative framing.
    const smartAgencyContent = smartContentBudget.total_ils / Math.max(1, smartDuration.expected)
    const smartAgencyLinks = smartLinkBudget.total_ils / Math.max(1, smartDuration.expected)
    const smartAgencyTech = (smartTechHours * LABOR_RATES_ILS_PER_HOUR.tech_seo_dev) / Math.max(1, Math.min(3, smartDuration.expected))
    const smartAgencyStrategist = smartStrategistHours * LABOR_RATES_ILS_PER_HOUR.seo_strategist
    const smartAgencyTooling = TOOLING_RATES_ILS_PER_MONTH.dataforseo_seo_pro
        + TOOLING_RATES_ILS_PER_MONTH.firecrawl_pro
        + TOOLING_RATES_ILS_PER_MONTH.pm_tools
    const smartAgencyMonthlyTotal = Math.round(
        smartAgencyContent + smartAgencyLinks + smartAgencyTech + smartAgencyStrategist + smartAgencyTooling,
    )
    const smartAgencyProgramTotal = Math.round(smartAgencyMonthlyTotal * smartDuration.expected)

    const smart: ScenarioBaseline = {
        name: 'smart',
        label_he: 'Smart — long-tail dominate',
        inputs: {
            target_top_3_keyword_count: targetTop3Smart,
            content_pieces_total: smartT2RInputs.content_pieces_total,
            content_pieces_breakdown: smartContent,
            links_total: smartLinkCount,
            links_breakdown: smartLinks,
            tech_seo_hours: smartTechHours,
            striking_distance_count: strikingDistanceCount,
            target_dr: smartT2RInputs.target_dr,
            our_dr_estimate: ourDrEstimate,
            competition_level: competitionLevel,
        },
        monthly_budget_ils: smartPlatformBudget,
        duration_months: smartDuration,
        total_program_ils: smartTotalProgram,
        agency_comparison_ils: {
            content_production: Math.round(smartAgencyContent),
            link_outreach_labor: Math.round(smartAgencyLinks),
            technical_seo: Math.round(smartAgencyTech),
            seo_strategist: Math.round(smartAgencyStrategist),
            tooling_subscriptions: Math.round(smartAgencyTooling),
            total_monthly: smartAgencyMonthlyTotal,
            total_program: smartAgencyProgramTotal,
            savings_vs_diy_total: smartAgencyProgramTotal - smartTotalProgram,
        },
        monthly_kpis: projectMonthlyKpis({
            duration_months: smartDuration.expected,
            content_pieces_total: smartT2RInputs.content_pieces_total,
            content_velocity: smartContentVelocity,
            links_total: smartLinkCount,
            target_top_3: targetTop3Smart,
            target_top_10: Math.round(targetTop3Smart * 2.5),
            strikingDistance: strikingDistanceCount,
            isAggressive: false,
        }),
        model_trace: {
            time_to_rank_inputs: smartT2RInputs,
            content_velocity_per_month: smartContentVelocity,
            outreach_emails_total: smartLinkBudget.breakdown.reduce((s, b) => s + b.outreach_emails, 0),
            outreach_hours_total: smartOutreachHours,
            risk_factors: [
                competitionLevel === 'high' ? 'תחרות גבוהה — ייתכן שצריך יותר זמן לפריצה' : 'תחרות סבירה',
                ourDrEstimate < 20 ? 'DR התחלתי נמוך — חודשי קליטה ראשונים יראו פחות תוצאות' : 'DR ברמה סבירה',
                strikingDistanceCount === 0 ? 'אין striking-distance pages — אין quick-wins ראשוניים' : `${strikingDistanceCount} striking-distance pages = quick wins ב-3 חודשים ראשונים`,
            ],
        },
    }

    // ─── Build AGGRESSIVE scenario ──
    const aggressiveContent: Partial<Record<ContentPieceType, number>> = {
        pillar_longform: Math.max(4, pillarCount),
        blog_standard: Math.max(15, totalSpokeCount * 2),
        comparison_review: Math.max(3, Math.ceil(takeNowCount * 0.2)),
        case_study: 4,
        landing_local: Math.max(3, Math.ceil(strikingDistanceCount * 0.5)),
        faq_page: Math.max(4, aeoPriorityCount),
        product_page: 0,
        refresh_existing: Math.max(0, strikingDistanceCount),
    }
    const aggressiveContentBudget = estimateContentBudgetIls(aggressiveContent)

    const aggressiveLinkCount = Math.max(60, Math.round(topCompetitorLinks / 4))
    const aggressiveLinks = computeLinkTierSplit(aggressiveLinkCount, 'aggressive')
    const aggressiveLinkBudget = estimateLinkBudgetIls(aggressiveLinks)

    const aggressiveTechHours = (techDebtHours ?? 50) + schemaHours + 30 // extra for advanced schema + IA
    // Phase QA round-8 — agents handle production + outreach drafting +
    // tech recommendations. Aggressive cadence: ~25 pieces/mo, daily monitoring.
    const aggressiveContentVelocity = 25
    const aggressiveStrategistHours = 32  // (agency comparison only — 8 hrs/week)
    const aggressiveOutreachHours = aggressiveLinkBudget.total_outreach_hours

    const aggressiveT2RInputs: TimeToRankInputs = {
        our_dr: ourDrEstimate,
        target_dr: Math.max(ourDrEstimate + 15, topCompetitorDr),
        content_pieces_total: aggressiveContentBudget.breakdown.reduce((s, b) => s + b.count, 0),
        content_velocity_per_month: aggressiveContentVelocity,
        striking_distance_count: strikingDistanceCount,
        competition_level: competitionLevel,
    }
    const aggressiveDuration = computeTimeToRank(aggressiveT2RInputs)

    // Platform-DIY budget for aggressive — Pro tier + paid ads.
    const aggressivePlatformBudget = estimatePlatformDiyBudget('aggressive')
    const aggMonthlyTotal = aggressivePlatformBudget.total
    const aggTotalProgram = Math.round(aggMonthlyTotal * aggressiveDuration.expected)

    // Agency comparison side-block — pre-2025 cost basis.
    const aggAgencyContent = aggressiveContentBudget.total_ils / Math.max(1, aggressiveDuration.expected)
    const aggAgencyLinks = aggressiveLinkBudget.total_ils / Math.max(1, aggressiveDuration.expected)
    const aggAgencyTech = (aggressiveTechHours * LABOR_RATES_ILS_PER_HOUR.tech_seo_dev) / Math.max(1, Math.min(4, aggressiveDuration.expected))
    const aggAgencyStrategist = aggressiveStrategistHours * LABOR_RATES_ILS_PER_HOUR.seo_strategist
    const aggAgencyTooling = TOOLING_RATES_ILS_PER_MONTH.dataforseo_with_backlinks
        + TOOLING_RATES_ILS_PER_MONTH.firecrawl_pro
        + TOOLING_RATES_ILS_PER_MONTH.semrush_or_ahrefs_alt
        + TOOLING_RATES_ILS_PER_MONTH.pm_tools
    const aggAgencyMonthlyTotal = Math.round(aggAgencyContent + aggAgencyLinks + aggAgencyTech + aggAgencyStrategist + aggAgencyTooling)
    const aggAgencyProgramTotal = Math.round(aggAgencyMonthlyTotal * aggressiveDuration.expected)

    const aggressive: ScenarioBaseline = {
        name: 'aggressive',
        label_he: 'Aggressive — דומיננטיות מלאה ב-SERP',
        inputs: {
            target_top_3_keyword_count: targetTop3Aggressive,
            content_pieces_total: aggressiveT2RInputs.content_pieces_total,
            content_pieces_breakdown: aggressiveContent,
            links_total: aggressiveLinkCount,
            links_breakdown: aggressiveLinks,
            tech_seo_hours: aggressiveTechHours,
            striking_distance_count: strikingDistanceCount,
            target_dr: aggressiveT2RInputs.target_dr,
            our_dr_estimate: ourDrEstimate,
            competition_level: competitionLevel,
        },
        monthly_budget_ils: aggressivePlatformBudget,
        duration_months: aggressiveDuration,
        total_program_ils: aggTotalProgram,
        agency_comparison_ils: {
            content_production: Math.round(aggAgencyContent),
            link_outreach_labor: Math.round(aggAgencyLinks),
            technical_seo: Math.round(aggAgencyTech),
            seo_strategist: Math.round(aggAgencyStrategist),
            tooling_subscriptions: Math.round(aggAgencyTooling),
            total_monthly: aggAgencyMonthlyTotal,
            total_program: aggAgencyProgramTotal,
            savings_vs_diy_total: aggAgencyProgramTotal - aggTotalProgram,
        },
        monthly_kpis: projectMonthlyKpis({
            duration_months: aggressiveDuration.expected,
            content_pieces_total: aggressiveT2RInputs.content_pieces_total,
            content_velocity: aggressiveContentVelocity,
            links_total: aggressiveLinkCount,
            target_top_3: targetTop3Aggressive,
            target_top_10: Math.round(targetTop3Aggressive * 2),
            strikingDistance: strikingDistanceCount,
            isAggressive: true,
        }),
        model_trace: {
            time_to_rank_inputs: aggressiveT2RInputs,
            content_velocity_per_month: aggressiveContentVelocity,
            outreach_emails_total: aggressiveLinkBudget.breakdown.reduce((s, b) => s + b.outreach_emails, 0),
            outreach_hours_total: aggressiveOutreachHours,
            risk_factors: [
                competitionLevel === 'high' ? 'תחרות גבוהה — תקציב חודשי גבוה הכרחי לשמירת ה-momentum' : 'תחרות מנוהלת',
                aggressiveLinkCount > 100 ? 'תכולת outreach גדולה — נדרש outreach specialist במשרה כמעט מלאה' : 'תכולת outreach בקצב סביר',
                'דורש team מובנה: 2 writers + tech lead + outreach + strategist',
            ],
        },
    }

    console.log(`[prefetch/cost_timeline_modeling] platform-DIY: smart=₪${smart.monthly_budget_ils.total}/mo × ${smart.duration_months.expected}mo = ₪${smart.total_program_ils} (agency would be ₪${smart.agency_comparison_ils.total_program}, save ₪${smart.agency_comparison_ils.savings_vs_diy_total}) | aggressive=₪${aggressive.monthly_budget_ils.total}/mo × ${aggressive.duration_months.expected}mo = ₪${aggressive.total_program_ils} (agency would be ₪${aggressive.agency_comparison_ils.total_program}, save ₪${aggressive.agency_comparison_ils.savings_vs_diy_total}) | upstream_missing=${upstreamMissing.length}`)

    return {
        upstreamMissing,
        business_context: {
            our_domain: ourDomain,
            our_dr_estimate: ourDrEstimate,
            top_competitor_dr: topCompetitorDr,
            top_competitor_link_count: topCompetitorLinks,
            competition_level: competitionLevel,
            target_top_3_count_smart: targetTop3Smart,
            target_top_3_count_aggressive: targetTop3Aggressive,
        },
        scenarios: { smart, aggressive },
        constants_snapshot: {
            usd_to_ils: USD_TO_ILS_RATE,
            // Platform-DIY (primary mode — what user actually pays)
            platform_business_tier_ils_per_month: PLATFORM_TIERS_ILS_PER_MONTH.business,
            platform_pro_tier_ils_per_month: PLATFORM_TIERS_ILS_PER_MONTH.pro,
            // Agency comparison rates (legacy / for narrative side-block only)
            seo_strategist_ils_per_hour: LABOR_RATES_ILS_PER_HOUR.seo_strategist,
            content_writer_ils_per_hour: LABOR_RATES_ILS_PER_HOUR.content_writer_he,
            tech_seo_ils_per_hour: LABOR_RATES_ILS_PER_HOUR.tech_seo_dev,
            outreach_jr_ils_per_hour: LABOR_RATES_ILS_PER_HOUR.outreach_jr,
            tooling_typical_ils_per_month: TOOLING_RATES_ILS_PER_MONTH.dataforseo_seo_pro
                + TOOLING_RATES_ILS_PER_MONTH.firecrawl_pro
                + TOOLING_RATES_ILS_PER_MONTH.pm_tools,
        },
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function inferOurDomain(rd: ResearchDataV2): string | null {
    const answers = (rd.answers || {}) as Record<string, unknown>
    const url = String(answers.websiteUrl || '').trim()
    if (!url) return null
    try {
        const u = new URL(url.startsWith('http') ? url : `https://${url}`)
        return u.hostname.replace(/^www\./, '')
    } catch { return null }
}

function inferOurDr(compLand: ResearchDataV2['results'] extends infer T ? T extends Record<string, unknown> ? T['competitor_landscape'] : unknown : unknown): number {
    if (!compLand || typeof compLand !== 'object') return 15
    const olp = ((compLand as Record<string, unknown>).extras as Record<string, unknown> | undefined)?.our_link_profile as Record<string, unknown> | undefined
    const rank = olp?.rank
    if (typeof rank === 'number') {
        // DFS rank is 0-1000 scale — convert to 0-100 DR-equivalent.
        return Math.min(100, Math.round((rank / 10)))
    }
    return 15  // conservative default for new sites
}

function inferTopCompetitorDr(records: Array<Record<string, unknown>>): number {
    if (records.length === 0) return 50
    let maxRank = 0
    for (const r of records.slice(0, 5)) {
        const linkProfile = r.link_profile_depth
        if (typeof linkProfile === 'string') {
            // Try to extract DR/rank mention from text — best effort
            const m = linkProfile.match(/rank[\s=:]*(\d{2,3})|DR[\s=:]*(\d{2,3})/i)
            if (m) {
                const n = parseInt(m[1] || m[2] || '0', 10)
                if (n > maxRank && n <= 100) maxRank = n
                else if (n > maxRank && n > 100 && n <= 1000) maxRank = Math.round(n / 10)
            }
        }
    }
    return maxRank > 0 ? maxRank : 55
}

function inferTopCompetitorLinkCount(records: Array<Record<string, unknown>>): number {
    if (records.length === 0) return 1500
    // Best-effort extraction from text fields
    for (const r of records.slice(0, 5)) {
        const lp = r.link_profile_depth
        if (typeof lp === 'string') {
            const m = lp.match(/backlinks?[\s=:]*([0-9,]+)/i)
            if (m) {
                const n = parseInt(m[1].replace(/,/g, ''), 10)
                if (n > 100) return n
            }
        }
    }
    return 1500
}

function inferCompetitionLevel(
    compRecords: Array<Record<string, unknown>>,
    kwRecords: Array<Record<string, unknown>>,
): 'low' | 'medium' | 'high' {
    // Heuristic:
    //   - Many high-scorecard competitors → high
    //   - Many take_now candidates → low (gap exists)
    //   - Few competitors but high-DR → medium
    let highScoreCount = 0
    for (const r of compRecords.slice(0, 5)) {
        const sc = r.scorecard as Record<string, unknown> | undefined
        if (typeof sc?.total === 'number' && sc.total >= 70) highScoreCount++
    }
    const takeNowCount = kwRecords.filter(r => {
        const opp = r.opportunity as Record<string, unknown> | undefined
        return opp?.decision === 'take_now'
    }).length
    if (highScoreCount >= 3) return 'high'
    if (takeNowCount >= 10) return 'low'
    return 'medium'
}

interface KpiProjectionInputs {
    duration_months: number
    content_pieces_total: number
    content_velocity: number
    links_total: number
    target_top_3: number
    target_top_10: number
    strikingDistance: number
    isAggressive: boolean
}

function projectMonthlyKpis(p: KpiProjectionInputs): ScenarioBaseline['monthly_kpis'] {
    // Curve model:
    //   - Striking distance + small refreshes deliver early top_10 gains in months 1-3
    //   - New content pages start ranking around month 4-5 (Google evaluation period)
    //   - Top 3 acquisition trails top 10 by 2-3 months
    //   - Organic clicks scales with cumulative top_10_count × avg_volume × CTR_curve
    //     We approximate avg_volume = 200 monthly searches per ranked keyword for
    //     typical IL niches; CTR for top_10 ≈ 5%, top_3 ≈ 20%.

    const months = Math.min(12, Math.max(3, p.duration_months))
    const out: ScenarioBaseline['monthly_kpis'] = []
    let cumulativeContent = 0
    let cumulativeLinks = 0
    const linksPerMonth = p.links_total / months

    for (let m = 1; m <= months; m++) {
        const newPieces = m === 1
            ? Math.min(p.content_velocity, Math.ceil(p.content_velocity * 0.7))  // ramp-up
            : Math.round(p.content_velocity)
        cumulativeContent = Math.min(p.content_pieces_total, cumulativeContent + newPieces)
        cumulativeLinks = Math.min(p.links_total, cumulativeLinks + Math.round(linksPerMonth))

        // Top 10 ramp curve: striking distance front-loaded, content kicks in ~m4
        const strikingTop10Gain = m <= 3 ? Math.round(p.strikingDistance * (m / 3) * 0.6) : Math.round(p.strikingDistance * 0.6)
        const contentTop10Gain = m >= 4 ? Math.round(((m - 3) / Math.max(1, months - 3)) * p.target_top_10 * 0.7) : 0
        const topTen = Math.min(p.target_top_10, strikingTop10Gain + contentTop10Gain)

        // Top 3 lags top_10 by ~3 months
        const topThree = m >= 5 ? Math.min(p.target_top_3, Math.round(((m - 4) / Math.max(1, months - 4)) * p.target_top_3)) : 0

        // Clicks model — IL niche assumptions
        const avgVolPerKw = p.isAggressive ? 350 : 180
        const clicksFromTop3 = topThree * avgVolPerKw * 0.20
        const clicksFromTop10NotTop3 = (topTen - topThree) * avgVolPerKw * 0.05
        const monthlyClicks = Math.round(clicksFromTop3 + clicksFromTop10NotTop3)

        out.push({
            month: m,
            new_pieces_published: newPieces,
            cumulative_pieces: cumulativeContent,
            new_links: Math.round(linksPerMonth),
            cumulative_links: cumulativeLinks,
            expected_top_10_count: topTen,
            expected_top_3_count: topThree,
            expected_organic_clicks: monthlyClicks,
        })
    }
    return out
}