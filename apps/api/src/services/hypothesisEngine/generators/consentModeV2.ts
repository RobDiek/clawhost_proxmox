/**
 * Phase 4.3.3 — Consent Mode v2 audit generator.
 *
 * 2026 reality: Google Consent Mode v2 (CMv2) became MANDATORY for EEA
 * traffic in March 2024. Non-compliant accounts had Ads bidding and
 * remarketing capabilities suspended. Two flavors:
 *   - Basic CMv2: tags blocked pre-consent. Strict compliance, big data loss.
 *   - Advanced CMv2: tags load in restricted mode, send cookieless pings,
 *     Google models the rest. Recovers 60-80% of conversion visibility.
 *
 * Even if the user's primary market is Israel (no GDPR), CMv2 matters when:
 *   (a) The account targets EU/UK at all (Diaspora customers, EU brand
 *       campaigns, EU lookalikes from IL customer base)
 *   (b) GTM scope is configured (we have tagmanager.* OAuth) — we can
 *       check for CMv2 tags directly via GTM API
 *   (c) Google Ads conversions in last 90d show EU-origin IPs (proxy:
 *       location_targeting='EU' in any campaign)
 *
 * Detection tiers:
 *   Tier 1 — Critical: GTM connected + Google Ads connected + paidProfile
 *     declares EU as target geo, but no CMv2 tags detected (or we don't
 *     have GTM data to verify). Account at risk of suspension.
 *   Tier 2 — High: GTM connected + EU traffic possible but unverified.
 *     Recommend CMv2 audit even without proven EU spend.
 *   Tier 3 — Info: No EU exposure detected. Skip silently (no hypothesis).
 *
 * For Phase 4.3 we use heuristic detection (paidProfile geo + adapter list).
 * Phase 4.4+ will add real GTM tag inspection via tagmanager.readonly scope.
 */

import type { GeneratorContext, HypothesisProposal } from '../types'

// EU/EEA country codes + UK (UK has equivalent GDPR-UK rules)
const EEA_KEYWORDS = [
    'eu', 'europe', 'eea', 'european union',
    'אירופה', 'איחוד אירופי', 'אירופאי',
    'germany', 'france', 'italy', 'spain', 'netherlands', 'belgium',
    'austria', 'sweden', 'denmark', 'finland', 'poland', 'czech',
    'portugal', 'greece', 'ireland', 'romania', 'hungary',
    'גרמניה', 'צרפת', 'איטליה', 'ספרד', 'הולנד', 'בלגיה',
    'uk', 'britain', 'united kingdom', 'gb', 'בריטניה', 'אנגליה',
]

interface EuExposure {
    declared: boolean        // paidProfile mentions EU/EEA
    proxied: boolean         // some signal we can't fully prove
    reasons: string[]
}

function detectEuExposure(ctx: GeneratorContext): EuExposure {
    const reasons: string[] = []
    const pp = ctx.paidProfile as Record<string, unknown> | undefined
    const ans = ctx.inventory as Record<string, unknown> | undefined
    void ans

    // 1. paidProfile.targetGeos / geography / countries
    const geoFields = ['targetGeos', 'geography', 'targetCountries', 'targetMarkets', 'countries', 'targetMarketHe']
    for (const f of geoFields) {
        const v = pp?.[f]
        if (typeof v === 'string') {
            const lower = v.toLowerCase()
            for (const kw of EEA_KEYWORDS) {
                if (lower.includes(kw.toLowerCase())) {
                    reasons.push(`paidProfile.${f} mentions "${kw}"`)
                    return { declared: true, proxied: false, reasons }
                }
            }
        } else if (Array.isArray(v)) {
            for (const item of v) {
                if (typeof item === 'string') {
                    const lower = item.toLowerCase()
                    for (const kw of EEA_KEYWORDS) {
                        if (lower.includes(kw.toLowerCase())) {
                            reasons.push(`paidProfile.${f}[] contains "${item}"`)
                            return { declared: true, proxied: false, reasons }
                        }
                    }
                }
            }
        }
    }

    // 2. Business description mentions EU/Europe
    const desc = String((pp?.businessDesc || pp?.description || '') as string).toLowerCase()
    for (const kw of EEA_KEYWORDS) {
        if (desc.includes(kw.toLowerCase())) {
            reasons.push(`Business description mentions "${kw}"`)
            return { declared: false, proxied: true, reasons }
        }
    }

    return { declared: false, proxied: false, reasons }
}

export async function generateConsentModeV2(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []

    const eu = detectEuExposure(ctx)
    if (!eu.declared && !eu.proxied) return out  // No EU exposure → skip

    const googleAdapter = ctx.inventory.adapters.find(a => a.id === 'google_ads')
    const gtmAdapter = ctx.inventory.adapters.find(a => a.id === 'gtm')

    if (!googleAdapter?.connected) return out  // No Google Ads = no risk

    const windowStart = new Date(ctx.now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const windowEnd = ctx.now.toISOString().slice(0, 10)

    // Tier 1: EU declared AND GTM connected (we'll later verify via API) → high-confidence ask
    if (eu.declared && gtmAdapter?.connected) {
        out.push({
            hypothesisCode: 'tracking_gap_consent_mode_v2_audit',
            title: 'EU traffic + Google Ads — Consent Mode v2 audit required (or risk suspension)',
            titleHe: 'תנועה מ-EU + Google Ads — נדרש audit ל-Consent Mode v2 (או סיכון להשעיה)',
            scopePlatform: 'google_ads',
            scopeDataType: 'account',
            scopeWindow: { start: windowStart, end: windowEnd },

            observation: `Your account declares EU/EEA exposure (${eu.reasons.join('; ')}) and has Google Ads + GTM connected. As of March 2024, Google requires Consent Mode v2 for EEA traffic. Accounts without it had bidding and remarketing suspended. We have GTM read access but haven't fully audited your container yet — until verified, treat this as a CRITICAL pre-launch check.`,
            observationHe: `החשבון שלכם מצהיר על חשיפה ל-EU/EEA (${eu.reasons.join('; ')}) ויש לכם Google Ads + GTM מחוברים. החל ממרץ 2024, Google דורש Consent Mode v2 לתנועה מ-EEA. חשבונות בלעדיו ספגו השעיית bidding ו-remarketing. יש לנו גישת קריאה ל-GTM אבל עדיין לא ביצענו audit מלא של ה-container — עד שיתבצע, התייחסו לזה כבדיקה קריטית לפני השקה.`,
            hypothesis: 'Audit GTM container for Consent Mode v2 tags. Required: Google tag (gtag) with consent default settings (analytics_storage, ad_storage, ad_user_data, ad_personalization all default to denied pre-consent). Recommended: Advanced Consent Mode (CMv2 Advanced) — restores 60-80% of conversion visibility via cookieless pings vs Basic CMv2.',
            hypothesisHe: 'בצעו audit ל-GTM container לזיהוי תגי Consent Mode v2. נדרש: תג Google (gtag) עם consent default settings (analytics_storage, ad_storage, ad_user_data, ad_personalization כולם default ל-denied לפני consent). מומלץ: Advanced Consent Mode (CMv2 Advanced) — משחזר 60-80% מנראות ההמרות דרך cookieless pings לעומת Basic CMv2.',
            reasoning: 'Without CMv2, Google Ads bidding for EU traffic was suspended on non-compliant accounts since March 2024. Advanced CMv2 specifically (vs Basic) recovers most of the data Google loses to consent denial — modeled conversions kick in to fill the gap. The four required consent params must default to "denied" before user gives consent, then "granted" after. Most CMP solutions (CookieYes, Cookiebot, OneTrust) auto-handle this if integrated correctly with GTM.',
            reasoningHe: 'בלי CMv2, Google Ads bidding לתנועת EU הושעה בחשבונות לא-תואמים החל ממרץ 2024. Advanced CMv2 ספציפית (לעומת Basic) משחזר את רוב ה-data ש-Google מאבד מסירוב consent — modeled conversions נכנסות לפעולה למלא את ה-gap. ארבעת פרמטרי ה-consent הנדרשים חייבים default ל-"denied" לפני שהמשתמש מאשר, ואז "granted" אחרי. רוב פתרונות ה-CMP (CookieYes, Cookiebot, OneTrust) מטפלים אוטומטית אם משולבים נכון עם GTM.',

            severity: 'critical',
            confidence: 0.85,
            expectedImpactKind: 'risk_mitigation',
            expectedImpactWindowDays: 30,

            evidenceSnapshot: {
                asOf: ctx.now.toISOString(),
                metrics: {
                    euDeclared: eu.declared,
                    euProxied: eu.proxied,
                    reasons: eu.reasons,
                    gtmConnected: gtmAdapter?.connected || false,
                    googleAdsConnected: true,
                },
                window: { start: windowStart, end: windowEnd },
            },
            evidenceQualityScore: 0.85,

            proposedAction: 'Verify GTM has Consent Mode v2 Advanced tags. Install a CMP (CookieYes / Cookiebot / OneTrust) if missing. Confirm all four consent params default to "denied" pre-consent.',
            proposedActionHe: 'ודאו ש-GTM כולל תגי Consent Mode v2 Advanced. התקינו CMP (CookieYes / Cookiebot / OneTrust) אם חסר. ודאו שכל ארבעת פרמטרי ה-consent מוגדרים default ל-"denied" לפני consent.',
            manualInstructions: [
                {
                    step: 1,
                    platformLabel: 'GTM',
                    actionLabel: 'Open Google Tag Manager → your container → Tags',
                    actionLabelHe: 'פתחו Google Tag Manager → ה-container שלכם → Tags',
                },
                {
                    step: 2,
                    platformLabel: 'GTM',
                    actionLabel: 'Search for "Google tag" (gtag) and verify Consent Initialization (Default Consent) trigger fires before all conversion tags',
                    actionLabelHe: 'חפשו "Google tag" (gtag) וודאו ש-Consent Initialization (Default Consent) trigger יורה לפני כל תגי conversion',
                    verifyHe: 'אם אין Consent Initialization tag — צריך להוסיף',
                },
                {
                    step: 3,
                    platformLabel: 'CMP (CookieYes/Cookiebot/OneTrust)',
                    actionLabel: 'Install CMP banner. Configure it to call gtag("consent", "update", ...) with the four required params',
                    actionLabelHe: 'התקינו CMP banner. הגדירו אותו לקרוא ל-gtag("consent", "update", ...) עם ארבעת הפרמטרים הנדרשים: analytics_storage, ad_storage, ad_user_data, ad_personalization',
                },
                {
                    step: 4,
                    platformLabel: 'GTM',
                    actionLabel: 'Add Consent Mode parameters to Google tag → "Built-in consent settings" → enable analytics_storage, ad_storage, ad_user_data, ad_personalization',
                    actionLabelHe: 'הוסיפו consent parameters לתג Google → "Built-in consent settings" → הפעילו את ארבעת השדות',
                },
                {
                    step: 5,
                    platformLabel: 'Google Ads',
                    actionLabel: 'In Google Ads → Tools → Conversions → look for "Consent mode" status. Should show "Active" within 24-48 hours.',
                    actionLabelHe: 'ב-Google Ads → Tools → Conversions → חפשו "Consent mode" status. צריך להיות "Active" תוך 24-48 שעות.',
                    verifyHe: 'אם status הוא "Inactive" אחרי 48 שעות — חסר tag setup, חזרו לשלב 1.',
                },
            ],

            testMethod: 'before_after_window',
            testWindowDays: 14,
            testSuccessCriteria: {
                metric: 'conversions',
                direction: 'increase',
                thresholdPct: 10,
                minConv: 15,
                minSpendIls: 500,
            },

            source: 'rule_engine',
        })
    }
    // Tier 2: EU declared but no GTM → user needs to install + configure
    else if (eu.declared && !gtmAdapter?.connected) {
        out.push({
            hypothesisCode: 'tracking_gap_consent_mode_v2_no_gtm',
            title: 'EU traffic declared but no GTM connected — Consent Mode v2 cannot be deployed',
            titleHe: 'תנועה מ-EU מוצהרת אבל GTM לא מחובר — Consent Mode v2 לא יכול לפעול',
            scopePlatform: 'google_ads',
            scopeDataType: 'account',
            scopeWindow: { start: windowStart, end: windowEnd },

            observation: `Your account declares EU exposure (${eu.reasons.join('; ')}) but GTM is not connected to Flowmatic. Without GTM, we cannot deploy or audit Consent Mode v2 tags. Google Ads requires CMv2 for EEA bidding to function.`,
            observationHe: `החשבון שלכם מצהיר על חשיפה ל-EU (${eu.reasons.join('; ')}) אבל GTM לא מחובר ל-Flowmatic. בלי GTM, אנחנו לא יכולים לפרוס או לבדוק תגי Consent Mode v2. Google Ads דורש CMv2 כדי ש-bidding ל-EEA יעבוד.`,
            hypothesis: 'Connect Google Tag Manager (read + write scope) to Flowmatic. Once connected, we can audit existing CMv2 tags, deploy missing ones via Mazhir GTM auto-setup, and verify consent flow.',
            hypothesisHe: 'חברו Google Tag Manager (read + write scope) ל-Flowmatic. ברגע שמחובר, נוכל לבדוק תגי CMv2 קיימים, לפרוס חסרים דרך Mazhir GTM auto-setup, ולוודא consent flow.',
            reasoning: 'Without GTM connection, the entire CMv2 setup must be done manually by you in GTM UI. Connecting GTM to Flowmatic lets Mazhir handle the tag deployment automatically — including Consent Mode v2 advanced, Enhanced Conversions, and Conversion Linker — in one operation.',
            reasoningHe: 'בלי חיבור GTM, כל ה-CMv2 setup חייב להיעשות ידנית על-ידכם ב-GTM UI. חיבור GTM ל-Flowmatic מאפשר ל-Mazhir לטפל ב-tag deployment אוטומטית — כולל Consent Mode v2 advanced, Enhanced Conversions, ו-Conversion Linker — בפעולה אחת.',

            severity: 'high',
            confidence: 0.8,
            expectedImpactKind: 'risk_mitigation',

            evidenceSnapshot: {
                asOf: ctx.now.toISOString(),
                metrics: {
                    euDeclared: eu.declared,
                    reasons: eu.reasons,
                    gtmConnected: false,
                    googleAdsConnected: true,
                },
                window: { start: windowStart, end: windowEnd },
            },

            proposedAction: 'Connect GTM via integrations tab → Google → re-OAuth with tagmanager.edit.containers scope.',
            proposedActionHe: 'חברו GTM דרך לשונית תוספים → Google → OAuth מחדש עם scope tagmanager.edit.containers.',

            source: 'rule_engine',
        })
    }

    return out
}