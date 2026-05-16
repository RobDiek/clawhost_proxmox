/**
 * Prefetch for client_account_baseline (Phase 4.2.1).
 *
 * This is the FIRST paid-track stage. It pulls every piece of historical
 * "client reality" data we have access to — Google Ads + GA4 — scoped to the
 * campaigns the user has assigned to this instance via the picker. Every
 * downstream paid stage (paid_competitor_landscape, paid_keyword_research,
 * paid_budget_scenarios, paid_audit, mazhir_audit) reads from
 * `rd.results.client_account_baseline` instead of refetching.
 *
 * Why this exists:
 *   - Without account-anchored history, paid keyword research invents seeds
 *     from DFS expansion (apartment rentals leak into storage research).
 *   - Without account-anchored CPC/CR, budget scenarios use industry benchmarks
 *     when the user's own account has ground truth.
 *   - Each stage previously refetched the same data → 3-4x API quota burn.
 *
 * Scope filtering:
 *   - When `googleAdsConfig.scope.mode = 'campaigns'`, every GAQL pull adds
 *     `AND campaign.id IN (...)` to filter to user-selected campaigns only.
 *   - When `mode = 'account'`, account-wide (only safe for single-tenant accounts).
 *   - When scope is missing/unconfigured, defaults to 'campaigns' with empty
 *     allowlist → zero data returned (defensive — better than leaking).
 *
 * Failure mode: each pull is isolated. If Google Ads is unavailable, GA4 still
 * runs. Downstream stages check `baseline.googleAds.available` and degrade
 * gracefully to DFS/industry baselines.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import type { ResearchDataV2 } from '@/services/research/types'
import {
    pullSearchTermsReport,
    pullAuctionInsights,
    pullChangeHistory,
    type SearchTermsResult,
    type AuctionInsightsResult,
    type ChangeHistoryResult,
    type CampaignScope,
} from '@/services/googleAdsDeepEnrich'

// GA4 pulls — these already exist for mazhir_audit; we move the call site
// earlier so the data is available to all paid stages, not just stage 4.
import { enrichWithGA4 } from '@/services/ga4Enrich'
import {
    pullGA4Funnel,
    pullGA4Seasonality,
    type GA4FunnelResult,
    type GA4SeasonalityResult,
} from '@/services/ga4DeepEnrich'

// GA4Result type lives inline in ga4Enrich.ts and isn't exported. Mirror its
// EXACT shape here so the await fits.
interface GA4EnrichResult {
    available: boolean
    reason?: string
    propertyId?: string
    daysAnalyzed: number
    totalConversions: number
    events: Array<{ eventName: string; eventCount: number }>
    estimatedConversionRatePct?: number
    sessionCount?: number
}

// ─── Result shape ─────────────────────────────────────────────────────────

export interface ClientAccountBaseline {
    /** Wall-clock when this baseline was generated. Used for TTL cache invalidation. */
    pulledAt: string

    /** Scope config applied to all Google Ads pulls. */
    scope: {
        mode: 'account' | 'campaigns'
        campaignIds: string[]
        appliedAt: string
    } | null

    /** Google Ads pulls — all scoped to user-selected campaigns. */
    googleAds: {
        available: boolean
        reason?: string
        customerId?: string

        /**
         * Search Terms Report (90d) — actual user search queries that triggered
         * ads. Top-converting terms become Tier-1 seeds for paid_keyword_research;
         * n-gram waste patterns become preemptive negatives.
         */
        sqr: SearchTermsResult

        /**
         * Auction Insights (90d) — real competitors with impression share +
         * overlap rate + outranking share on YOUR auctions. Feeds
         * paid_competitor_landscape (overrides client's "competitor list" guess).
         */
        auctionInsights: AuctionInsightsResult

        /**
         * Change History (180d) — significant structural changes (budget, bidding,
         * conversion actions). Feeds mazhir_audit so we don't recommend things
         * the user has already tried and reverted.
         */
        changeHistory: ChangeHistoryResult
    }

    /** GA4 pulls — site-wide (no campaign scoping needed; GA4 isn't ad-account-bound). */
    ga4: {
        available: boolean
        reason?: string

        /** Conversion events + spend attribution (already used by mazhir_audit). */
        events: GA4EnrichResult

        /**
         * Landing-page-level funnel (90d) — which LPs convert best. Feeds
         * paid_budget_scenarios (LP-CR is the assumption that drives CPA target).
         */
        funnel: GA4FunnelResult

        /**
         * Seasonality (730d / 2y) — monthly index. Feeds paid_budget_scenarios
         * timing (don't recommend "ramp up in March" if Mar is the user's
         * historical low).
         */
        seasonality: GA4SeasonalityResult
    }

    /** Provenance + cost roll-up. */
    diagnostics: {
        startedAt: string
        finishedAt: string
        totalLatencyMs: number
        googleAdsCallsAttempted: number
        googleAdsCallsFailed: number
        ga4CallsAttempted: number
        ga4CallsFailed: number
    }

    /** Hard warnings to surface to Opus (so it tempers confidence accordingly). */
    warnings: string[]
}

// ─── Prefetcher ───────────────────────────────────────────────────────────

export async function prefetchClientAccountBaseline(
    instanceId: string,
    rd: ResearchDataV2,
): Promise<ClientAccountBaseline> {
    const startedAtMs = Date.now()
    const startedAt = new Date(startedAtMs).toISOString()

    // 1. Pull credentials + scope from DB
    const [instance] = await db.select({
        googleAdsConfig: instances.googleAdsConfig,
        googleTokens: instances.googleTokens,
    }).from(instances).where(eq(instances.id, instanceId))

    const gadsCfg = (instance?.googleAdsConfig as Record<string, unknown> | null) || {}
    const customerId = gadsCfg.customerId as string | undefined
    const loginCustomerId = (gadsCfg.loginCustomerId as string | undefined) || customerId
    const developerToken = gadsCfg.developerToken as string | undefined
    const gt = (instance?.googleTokens as Record<string, unknown> | null) || {}
    const refreshToken = (gt.refreshToken as string | undefined) || (gt.refresh_token as string | undefined)
    const googleTokens = refreshToken ? { refreshToken } : null

    const rawScope = gadsCfg.scope as { mode?: string; campaignIds?: string[]; selectedAt?: string } | undefined
    // Default scope: if user has not yet picked, we behave 'campaigns' with empty allowlist.
    // This is intentional — we'd rather return zero data than leak unrelated business data
    // from accounts that host multiple clients (the very case Phase 4.2.1 was built for).
    const scope: CampaignScope = rawScope?.mode === 'account'
        ? { mode: 'account' }
        : { mode: 'campaigns', campaignIds: (rawScope?.campaignIds || []).filter(id => /^\d+$/.test(id)) }

    const scopeSummary = rawScope ? {
        mode: rawScope.mode === 'account' ? 'account' as const : 'campaigns' as const,
        campaignIds: rawScope.campaignIds || [],
        appliedAt: rawScope.selectedAt || startedAt,
    } : null

    // 2. Site URL for GA4 — pulled from research answers (no DB column).
    const websiteUrl = (rd.answers as { websiteUrl?: string } | undefined)?.websiteUrl || undefined

    // 3. Google Ads pulls — all scoped, all in parallel
    let gadsAttempted = 0
    let gadsFailed = 0
    const warnings: string[] = []

    if (!customerId) {
        warnings.push('Google Ads לא מחובר — אין Customer ID. כל שלבי הפרסום ירוצו במצב מוגבל (DFS+industry בלבד, ללא ground-truth מהחשבון שלכם).')
    } else if (!developerToken) {
        warnings.push('Google Ads Developer Token חסר ב-DB. נסו לחבר Google Ads מחדש דרך הטופס.')
    } else if (!refreshToken) {
        warnings.push('Google Ads OAuth חסר refresh token — חברו מחדש דרך Google Auth כדי לאפשר משיכת היסטוריה.')
    } else if (scope.mode === 'campaigns' && (scope.campaignIds || []).length === 0) {
        warnings.push('בחירת קמפיינים ריקה — לא נמשוך נתוני Google Ads כדי לא לדלוף נתונים של עסקים אחרים מהחשבון. השתמשו ב-"בחרו קמפיינים" כדי לסמן את שלכם.')
    }

    const wantGoogleAds = !!(customerId && developerToken && refreshToken && !(scope.mode === 'campaigns' && (scope.campaignIds || []).length === 0))

    const [sqrResult, auctionResult, changeHistoryResult] = await Promise.all([
        wantGoogleAds ? (() => { gadsAttempted++; return pullSearchTermsReport(customerId, googleTokens, 90, scope, loginCustomerId, developerToken) })()
            .catch((err): SearchTermsResult => {
                gadsFailed++
                return { available: false, reason: `SQR threw: ${(err as Error).message}`, daysAnalyzed: 90, totalTerms: 0, totalSpendIls: 0, wasteByPattern: [], topConvertingTerms: [], estimatedWastedSpendPct: 0 }
            })
            : Promise.resolve<SearchTermsResult>({ available: false, reason: 'Google Ads not connected or no scope', daysAnalyzed: 0, totalTerms: 0, totalSpendIls: 0, wasteByPattern: [], topConvertingTerms: [], estimatedWastedSpendPct: 0 }),

        wantGoogleAds ? (() => { gadsAttempted++; return pullAuctionInsights(customerId, googleTokens, 90, scope, loginCustomerId, developerToken) })()
            .catch((err): AuctionInsightsResult => {
                gadsFailed++
                return { available: false, reason: `Auction Insights threw: ${(err as Error).message}`, competitors: [] }
            })
            : Promise.resolve<AuctionInsightsResult>({ available: false, reason: 'Google Ads not connected or no scope', competitors: [] }),

        wantGoogleAds ? (() => { gadsAttempted++; return pullChangeHistory(customerId, googleTokens, 180, scope, loginCustomerId, developerToken) })()
            .catch((err): ChangeHistoryResult => {
                gadsFailed++
                return { available: false, reason: `Change history threw: ${(err as Error).message}`, daysAnalyzed: 180, totalChanges: 0, bigChanges: [] }
            })
            : Promise.resolve<ChangeHistoryResult>({ available: false, reason: 'Google Ads not connected or no scope', daysAnalyzed: 0, totalChanges: 0, bigChanges: [] }),
    ])

    // 4. GA4 pulls — site-wide (GA4 isn't ad-account-bound, no scope filter needed).
    let ga4Attempted = 0
    let ga4Failed = 0

    const wantGa4 = !!(websiteUrl && refreshToken)

    const ga4PropertyId = (gt.ga4PropertyId as string | undefined)
    const ga4TokensForCall = googleTokens
        ? { ...googleTokens, ga4PropertyId }
        : null

    const [eventsResult, funnelResult, seasonalityResult] = await Promise.all([
        wantGa4 ? (() => { ga4Attempted++; return enrichWithGA4(ga4TokensForCall, { siteUrl: websiteUrl, days: 365, propertyId: ga4PropertyId }) })()
            .catch((err): GA4EnrichResult => {
                ga4Failed++
                return { available: false, reason: `GA4 events threw: ${(err as Error).message}`, daysAnalyzed: 0, totalConversions: 0, events: [] }
            })
            : Promise.resolve<GA4EnrichResult>({ available: false, reason: 'GA4 not connected', daysAnalyzed: 0, totalConversions: 0, events: [] }),

        wantGa4 ? (() => { ga4Attempted++; return pullGA4Funnel(ga4TokensForCall, websiteUrl, 90) })()
            .catch((err): GA4FunnelResult => {
                ga4Failed++
                return { available: false, reason: `GA4 funnel threw: ${(err as Error).message}`, daysAnalyzed: 0, byLandingPage: [], bySource: [] }
            })
            : Promise.resolve<GA4FunnelResult>({ available: false, reason: 'GA4 not connected', daysAnalyzed: 0, byLandingPage: [], bySource: [] }),

        wantGa4 ? (() => { ga4Attempted++; return pullGA4Seasonality(ga4TokensForCall, websiteUrl, 730) })()
            .catch((err): GA4SeasonalityResult => {
                ga4Failed++
                return { available: false, reason: `GA4 seasonality threw: ${(err as Error).message}`, daysAnalyzed: 0, monthly: [], seasonalIndex: [] }
            })
            : Promise.resolve<GA4SeasonalityResult>({ available: false, reason: 'GA4 not connected', daysAnalyzed: 0, monthly: [], seasonalIndex: [] }),
    ])

    // 5. Roll up Google Ads "available" — true if any pull succeeded
    const googleAdsAvailable = sqrResult.available || auctionResult.available || changeHistoryResult.available
    let googleAdsReason: string | undefined
    if (!googleAdsAvailable) {
        if (!customerId) googleAdsReason = 'Customer ID לא הוגדר'
        else if (!refreshToken) googleAdsReason = 'OAuth refresh token חסר'
        else if (scope.mode === 'campaigns' && (scope.campaignIds || []).length === 0) googleAdsReason = 'לא נבחרו קמפיינים — השתמשו בבורר ההיקף'
        else googleAdsReason = sqrResult.reason || auctionResult.reason || changeHistoryResult.reason
    }

    // Additional warnings based on data quality
    if (sqrResult.available && sqrResult.totalTerms < 30) {
        warnings.push(`SQR מחזיר רק ${sqrResult.totalTerms} מילים — נפח קמפיינים נמוך מדי לזיהוי patterns אמינים (צריך 100+ לאיכות גבוהה).`)
    }
    if (eventsResult.available && eventsResult.totalConversions < 30) {
        warnings.push(`GA4 רושם רק ${eventsResult.totalConversions} המרות ב-365 ימים — אין מספיק נתונים ל-CR-based budget anchoring.`)
    }

    const finishedAtMs = Date.now()

    return {
        pulledAt: startedAt,
        scope: scopeSummary,
        googleAds: {
            available: googleAdsAvailable,
            reason: googleAdsReason,
            customerId,
            sqr: sqrResult,
            auctionInsights: auctionResult,
            changeHistory: changeHistoryResult,
        },
        ga4: {
            available: eventsResult.available || funnelResult.available || seasonalityResult.available,
            reason: !eventsResult.available ? eventsResult.reason : undefined,
            events: eventsResult,
            funnel: funnelResult,
            seasonality: seasonalityResult,
        },
        diagnostics: {
            startedAt,
            finishedAt: new Date(finishedAtMs).toISOString(),
            totalLatencyMs: finishedAtMs - startedAtMs,
            googleAdsCallsAttempted: gadsAttempted,
            googleAdsCallsFailed: gadsFailed,
            ga4CallsAttempted: ga4Attempted,
            ga4CallsFailed: ga4Failed,
        },
        warnings,
    }
}