/**
 * Per-platform data-trust tier classifier.
 *
 * Ranks each paid platform's conversion data quality based on what signals
 * we can detect from the adapter inventory + ingested-row metadata:
 *
 *   observed_server  → CAPI / server-side events present (Meta with token,
 *                       Google with EAM, GA4 measurement protocol)
 *   observed_browser → pixel/tag tracking only — drops with iOS 17.2,
 *                       Safari ITP, ad-blockers (~30-40% loss on Meta)
 *   modeled_platform → platform's own machine-learning attribution
 *                       (Smart Bidding, Advantage+, value-based, data-driven)
 *   inferred         → last-click / first-click only, no behavioral signal
 *
 * Used by:
 *   - Dashboard MER widget — shows per-platform trust badge so the user
 *     knows which platform's numbers to weight in their decisions
 *   - crossPlatformGap generator — heavily-modeled platforms are flagged
 *     for geo-experiment validation since their claimed efficiency is
 *     fundamentally untestable against observed truth
 *   - capiEmqAudit generator — drives the upgrade recommendation
 */

export type DataTrustTier = 'observed_server' | 'observed_browser' | 'modeled_platform' | 'inferred'

export interface PlatformTrust {
    platform: string
    tier: DataTrustTier
    tierRank: number                    // 1 (best) → 4 (worst); easier to sort/compare
    tierLabelHe: string
    tierLabelEn: string
    rationale: string                   // why this platform got this tier
    rationaleHe: string
    upgradeHintHe?: string              // how to move up a tier (if applicable)
}

interface AdapterRef {
    id: string
    connected: boolean
    metadata?: Record<string, unknown> | null
}

export interface ClassifyInput {
    adapters: AdapterRef[]
    platformsWithSpend: string[]
    /** Per-platform: most-recent attribution mode observed in the data window. */
    attributionModesByPlatform?: Record<string, string[] | undefined>
}

const TIER_RANK: Record<DataTrustTier, number> = {
    observed_server: 1,
    observed_browser: 2,
    modeled_platform: 3,
    inferred: 4,
}

const TIER_LABEL_HE: Record<DataTrustTier, string> = {
    observed_server: 'נצפה (שרת)',
    observed_browser: 'נצפה (דפדפן)',
    modeled_platform: 'מודלי (פלטפורמה)',
    inferred: 'משוערך',
}
const TIER_LABEL_EN: Record<DataTrustTier, string> = {
    observed_server: 'Observed (server)',
    observed_browser: 'Observed (browser)',
    modeled_platform: 'Modeled (platform)',
    inferred: 'Inferred',
}

function getAdapter(adapters: AdapterRef[], id: string): AdapterRef | undefined {
    return adapters.find(a => a.id === id)
}

function classifyMeta(adapters: AdapterRef[], attributionModes?: string[]): PlatformTrust {
    const meta = getAdapter(adapters, 'meta_ads')
    const metaMeta = (meta?.metadata || {}) as Record<string, unknown>
    const capiPresent = Boolean(metaMeta.capiTokenPresent || metaMeta.capi_configured || metaMeta.serverEvents)
    const pixelId = metaMeta.pixelId
    const usingDataDriven = (attributionModes || []).includes('data_driven')
    const usingAdvantageBidding = Boolean(metaMeta.advantageBudget || metaMeta.advantageBidding)

    if (capiPresent) {
        return {
            platform: 'meta',
            tier: 'observed_server',
            tierRank: TIER_RANK.observed_server,
            tierLabelHe: TIER_LABEL_HE.observed_server,
            tierLabelEn: TIER_LABEL_EN.observed_server,
            rationale: 'Conversions API token present; server-side events backstop browser pixel.',
            rationaleHe: 'טוקן CAPI מחובר — אירועים בצד-שרת מגבים את הפיקסל בדפדפן.',
        }
    }
    if (pixelId && !capiPresent && usingAdvantageBidding) {
        return {
            platform: 'meta',
            tier: 'modeled_platform',
            tierRank: TIER_RANK.modeled_platform,
            tierLabelHe: TIER_LABEL_HE.modeled_platform,
            tierLabelEn: TIER_LABEL_EN.modeled_platform,
            rationale: 'Pixel only + Advantage bidding — Meta\'s ML fills gaps with modeled conversions.',
            rationaleHe: 'פיקסל בלבד + Advantage bidding — Meta משלימה אירועים חסרים באמצעות מודל ML.',
            upgradeHintHe: 'התקינו CAPI להעלאת רמת האמון לרמת "נצפה (שרת)".',
        }
    }
    if (pixelId) {
        return {
            platform: 'meta',
            tier: 'observed_browser',
            tierRank: TIER_RANK.observed_browser,
            tierLabelHe: TIER_LABEL_HE.observed_browser,
            tierLabelEn: TIER_LABEL_EN.observed_browser,
            rationale: 'Pixel only — exposed to iOS 17.2 caps and ad-blockers (~30-40% signal loss).',
            rationaleHe: 'פיקסל בלבד — חשוף לחסימת iOS 17.2 ולחוסמי פרסומות (איבוד ~30-40% מהאירועים).',
            upgradeHintHe: 'התקינו CAPI להעלאת רמת האמון.',
        }
    }
    return {
        platform: 'meta',
        tier: 'inferred',
        tierRank: TIER_RANK.inferred,
        tierLabelHe: TIER_LABEL_HE.inferred,
        tierLabelEn: TIER_LABEL_EN.inferred,
        rationale: 'No pixel and no CAPI — conversions are platform-attributed without behavioral signal.',
        rationaleHe: 'אין פיקסל ואין CAPI — הקליקים מיוחסים ללא אות תנהגותי מהלקוח.',
        upgradeHintHe: 'התקינו פיקסל מטא ו-CAPI להעלאת רמת האמון.',
    }
}

function classifyGoogleAds(adapters: AdapterRef[], attributionModes?: string[]): PlatformTrust {
    const ga = getAdapter(adapters, 'google_ads')
    const gtm = getAdapter(adapters, 'gtm')
    const ga4 = getAdapter(adapters, 'ga4')
    const gaMeta = (ga?.metadata || {}) as Record<string, unknown>
    const eamPresent = Boolean(gaMeta.enhancedConversionsActive || gaMeta.eamConfigured)
    const usingDataDriven = (attributionModes || []).includes('data_driven')
    const hasSmartBidding = Boolean(gaMeta.smartBiddingActive || gaMeta.bidStrategyTier === 'smart')
    const gtmConnected = Boolean(gtm?.connected)
    const ga4Connected = Boolean(ga4?.connected)

    if (eamPresent) {
        return {
            platform: 'google_ads',
            tier: 'observed_server',
            tierRank: TIER_RANK.observed_server,
            tierLabelHe: TIER_LABEL_HE.observed_server,
            tierLabelEn: TIER_LABEL_EN.observed_server,
            rationale: 'Enhanced Conversions for Ads active — hashed first-party data flowing.',
            rationaleHe: 'Enhanced Conversions פעיל — נתונים מצד-לקוח מוצפנים זורמים לגוגל.',
        }
    }
    if (usingDataDriven || hasSmartBidding) {
        return {
            platform: 'google_ads',
            tier: 'modeled_platform',
            tierRank: TIER_RANK.modeled_platform,
            tierLabelHe: TIER_LABEL_HE.modeled_platform,
            tierLabelEn: TIER_LABEL_EN.modeled_platform,
            rationale: 'Data-driven / Smart Bidding active without EAM — Google fills with modeled attributions.',
            rationaleHe: 'Data-driven / Smart Bidding פעיל בלי EAM — גוגל משלימה ייחוסים מודליים.',
            upgradeHintHe: 'הפעילו Enhanced Conversions for Ads להעלאת רמת האמון.',
        }
    }
    if (gtmConnected || ga4Connected) {
        return {
            platform: 'google_ads',
            tier: 'observed_browser',
            tierRank: TIER_RANK.observed_browser,
            tierLabelHe: TIER_LABEL_HE.observed_browser,
            tierLabelEn: TIER_LABEL_EN.observed_browser,
            rationale: 'GTM/GA4 client-side tags — exposed to ITP and consent loss.',
            rationaleHe: 'תיוג GTM/GA4 בצד-לקוח — חשוף לאיבוד הסכמה ול-ITP.',
            upgradeHintHe: 'הפעילו Enhanced Conversions for Ads.',
        }
    }
    return {
        platform: 'google_ads',
        tier: 'inferred',
        tierRank: TIER_RANK.inferred,
        tierLabelHe: TIER_LABEL_HE.inferred,
        tierLabelEn: TIER_LABEL_EN.inferred,
        rationale: 'No EAM, no GTM/GA4 — conversions are last-click attributed only.',
        rationaleHe: 'אין EAM ואין GTM/GA4 — ייחוס last-click בלבד.',
        upgradeHintHe: 'חברו GTM + GA4 ולאחר מכן Enhanced Conversions.',
    }
}

function classifyGeneric(platform: string, _adapters: AdapterRef[]): PlatformTrust {
    // Fallback for tiktok / linkedin / microsoft_ads — we don't have detection
    // for their server-side equivalents yet; default to observed_browser if
    // there's any spend at all (the conservative call), and let future
    // adapters refine.
    return {
        platform,
        tier: 'observed_browser',
        tierRank: TIER_RANK.observed_browser,
        tierLabelHe: TIER_LABEL_HE.observed_browser,
        tierLabelEn: TIER_LABEL_EN.observed_browser,
        rationale: 'Default browser-side tracking assumed (adapter-specific detection pending).',
        rationaleHe: 'תיוג בצד-לקוח בברירת מחדל (זיהוי ספציפי לאדפטר טרם הושק).',
    }
}

export function classifyDataTrust(input: ClassifyInput): PlatformTrust[] {
    const out: PlatformTrust[] = []
    for (const p of input.platformsWithSpend) {
        const am = input.attributionModesByPlatform?.[p]
        if (p === 'meta') out.push(classifyMeta(input.adapters, am))
        else if (p === 'google_ads') out.push(classifyGoogleAds(input.adapters, am))
        else out.push(classifyGeneric(p, input.adapters))
    }
    return out
}

/**
 * Convenience: weighted-average trust score for the whole account.
 * 0.0 (all inferred) → 1.0 (all server-observed). Weighted by spend share.
 */
export function compositeTrustScore(
    classifications: PlatformTrust[],
    spendByPlatform: Record<string, number>,
): { score: number; weakestPlatform: string | null } {
    const totalSpend = Object.values(spendByPlatform).reduce((s, n) => s + n, 0)
    if (totalSpend <= 0) return { score: 0, weakestPlatform: null }

    // Tier→score mapping: server=1.0, browser=0.7, modeled=0.4, inferred=0.1
    const tierScore: Record<DataTrustTier, number> = {
        observed_server: 1.0,
        observed_browser: 0.7,
        modeled_platform: 0.4,
        inferred: 0.1,
    }
    let weighted = 0
    let weakestRank = 0
    let weakestPlatform: string | null = null
    for (const c of classifications) {
        const w = (spendByPlatform[c.platform] || 0) / totalSpend
        weighted += w * tierScore[c.tier]
        if (c.tierRank > weakestRank) {
            weakestRank = c.tierRank
            weakestPlatform = c.platform
        }
    }
    return { score: weighted, weakestPlatform }
}