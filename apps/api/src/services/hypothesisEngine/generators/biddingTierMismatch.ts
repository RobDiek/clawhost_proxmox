/**
 * Bidding tier mismatch generator.
 *
 * Theory (Vallaeys 2026 / Optmyzr bidding ladder):
 *   Max Clicks → Maximize Conversions @ 15 conv/30d → tCPA @ 30 conv/30d
 *               → tROAS @ 50 conv/30d + value tracking
 *
 * Standard error of CVR at n=15 ≈ 25%; at n=30 ≈ 18%; at n=50 ≈ 14%.
 * Smart Bidding cannot stabilize below n=15, so accounts under that threshold
 * waste budget on a noisy signal — better to stay on Max Clicks and harvest
 * cheap clicks while data accumulates.
 *
 * Decision logic (per-platform):
 *
 *   T0 (no spend yet)               → no hypothesis (nothing to optimize)
 *   T1 (conv30d <10)                → if Smart Bidding currently → demote to Max Clicks
 *   T2 (10-29 conv30d)              → Max Conversions; tCPA premature
 *   T2 stable for 14d AT >30 conv   → tCPA candidate
 *   T4 (>30 + tracking healthy)     → tCPA → if value tracking active → tROAS
 *
 * For Phase 1 we don't have *current bidding strategy* from the source data
 * (it's not in CSV exports — needs Google Ads API call for ground truth).
 * So we generate "consider transitioning to X" hypotheses ALL THE TIME the
 * conditions are met; the lifecycle layer dedups by (code, scope) so repeat
 * proposals don't clog the queue.
 *
 * The "consider" framing is correct because: even if user is already on the
 * recommended strategy, the hypothesis serves as a confirmation gate (user
 * sees "we think you should be on tCPA — are you?" → yes → mark validated
 * without testing).
 */

import type { GeneratorContext, HypothesisProposal } from '../types'

export async function generateBiddingTierMismatch(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []
    if (!ctx.inventory.perPlatform || ctx.inventory.perPlatform.length === 0) return out

    const windowStart = new Date(ctx.now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const windowEnd = ctx.now.toISOString().slice(0, 10)

    for (const p of ctx.inventory.perPlatform) {
        const platform = p.platform
        if (platform !== 'meta' && platform !== 'google_ads') continue
        if (p.spend90dIls === 0) continue

        const conv30 = p.conv30d
        const platformLabel = platform === 'meta' ? 'Meta' : 'Google Ads'

        // ── T1 / starving: <10 conv/30d → recommend Max Clicks ─────────
        if (conv30 < 10) {
            out.push({
                hypothesisCode: 'bidding_tier_demotion_smart_to_max_clicks',
                title: `${platformLabel}: Smart Bidding starving on ${conv30} conv/30d`,
                titleHe: `${platformLabel}: Smart Bidding מורעב על ${conv30} המרות ב-30 ימים`,
                scopePlatform: platform,
                scopeDataType: 'account',
                scopeWindow: { start: windowStart, end: windowEnd },

                observation: `${conv30} conversions in last 30 days on ${platformLabel}. Smart Bidding algorithms require at least 15 conversions/30d to produce stable bids (standard error of CVR at n=15 is ~25%).`,
                observationHe: `${conv30} המרות ב-30 הימים האחרונים ב-${platformLabel}. Smart Bidding דורש מינימום 15 המרות ב-30 ימים כדי לייצר הצעות מחיר יציבות (שגיאת תקן של CVR ב-n=15 היא ~25%).`,
                hypothesis: `If currently on Maximize Conversions or tCPA, downgrade to Maximize Clicks until ${platformLabel === 'Meta' ? '15+ conversions in 7 days' : '15+ conversions in 30 days'}. Smart Bidding under this threshold optimizes on noise.`,
                hypothesisHe: `אם הקמפיינים עכשיו על Maximize Conversions או tCPA, רדו ל-Maximize Clicks עד ${platformLabel === 'Meta' ? 'שתהיו עם 15+ המרות ב-7 ימים' : 'שתהיו עם 15+ המרות ב-30 ימים'}. Smart Bidding מתחת לסף הזה מתאמן על רעש.`,
                reasoning: `Mathematical floor: at n=10 conversions, the 95% CI on CVR spans ±35%. The algo will whipsaw bids, burning budget on volatile estimates. Max Clicks gives cheaper clicks and accumulates the signal faster. Plan to transition to Max Conversions when conv30d ≥ 15 for 2 consecutive weeks.`,
                reasoningHe: `רצפה מתמטית: ב-n=10 המרות, ה-CI של 95% על CVR הוא ±35%. האלגוריתם יזעזע את ההצעות, יבזבז תקציב על אומדנים תנודתיים. Max Clicks נותן קליקים זולים יותר ומאיץ צבירת סיגנל. תכננו מעבר ל-Max Conversions כשמגיעים ל-15+ המרות ב-30 ימים במשך שבועיים רצופים.`,

                severity: 'high',
                confidence: 0.8,
                expectedImpactKind: 'cpa_reduction',
                expectedImpactWindowDays: 30,

                evidenceSnapshot: {
                    asOf: ctx.now.toISOString(),
                    metrics: {
                        platform,
                        conv30d: conv30,
                        spend90dIls: p.spend90dIls,
                        tier: p.tier,
                    },
                    window: { start: windowStart, end: windowEnd },
                },

                proposedAction: `Change campaign bidding strategy to Maximize Clicks (or equivalent on ${platformLabel}). Reassess in 14 days.`,
                proposedActionHe: `שנו את אסטרטגיית ההצעות של הקמפיינים ל-Maximize Clicks (או המקבילה ב-${platformLabel}). הערכה מחדש בעוד 14 ימים.`,
                manualInstructions: buildManualInstructions_demoteToMaxClicks(platform),
                apiActionRecipe: undefined,   // bidding-strategy change via API needs the campaign id — added by lifecycle when user picks scope

                testMethod: 'before_after_window',
                testWindowDays: 14,
                testSuccessCriteria: {
                    metric: 'cpa_ils',
                    direction: 'decrease',
                    thresholdPct: 10,
                    minConv: 5,
                    minSpendIls: 200,
                },

                source: 'rule_engine',
            })
        }

        // ── T2 / ready for tCPA: 30+ conv/30d AND tracking healthy ────────
        else if (conv30 >= 30) {
            const trackingHealthy = ctx.inventory.adapters
                .filter(a => ['ga4', 'gtm'].includes(a.id))
                .every(a => a.connected)
            if (trackingHealthy) {
                out.push({
                    hypothesisCode: 'bidding_tier_mismatch_max_conv_to_tcpa',
                    title: `${platformLabel}: ${conv30} conv/30d — eligible for tCPA`,
                    titleHe: `${platformLabel}: ${conv30} המרות ב-30 ימים — זכאי ל-tCPA`,
                    scopePlatform: platform,
                    scopeDataType: 'account',
                    scopeWindow: { start: windowStart, end: windowEnd },

                    observation: `${conv30} conversions in 30 days AND tracking infrastructure (GA4 + GTM) is healthy. Smart Bidding has the stable signal needed for target-CPA optimization (SE of CVR at n=30 ≈ 18%).`,
                    observationHe: `${conv30} המרות ב-30 ימים + תשתית מעקב (GA4 + GTM) תקינה. Smart Bidding מקבל את הסיגנל היציב הנדרש לאופטימיזציה של tCPA (שגיאת תקן של CVR ב-n=30 ≈ 18%).`,
                    hypothesis: `Transition campaigns from Maximize Conversions to Target CPA (tCPA). Set target = your current account-average CPA. Smart Bidding will hit it more efficiently than Max Conv because it gets an explicit cost ceiling.`,
                    hypothesisHe: `העבירו קמפיינים מ-Maximize Conversions ל-Target CPA (tCPA). הגדירו יעד = ה-CPA הממוצע הנוכחי של החשבון. Smart Bidding יפגע ביעד ביעילות גבוהה יותר מ-Max Conv כי הוא מקבל תקרת עלות מפורשת.`,
                    reasoning: `Per Optmyzr 2026 + Google's own guidance, tCPA outperforms Max Conv by 8-15% on CPA at n≥30 conv/30d. The mechanism: Max Conv tries to spend the budget; tCPA tries to hit a cost target. With clear conversion signal, tCPA's constraint actually helps the algo bid more conservatively on low-quality auctions.`,
                    reasoningHe: `לפי Optmyzr 2026 + הנחיות Google, tCPA מנצח את Max Conv ב-8-15% ב-CPA כשיש 30+ המרות ב-30 ימים. המנגנון: Max Conv מנסה לבזבז את התקציב; tCPA מנסה לפגוע ביעד עלות. עם סיגנל המרה ברור, האילוץ של tCPA דווקא עוזר לאלגוריתם להציע יותר בזהירות במכרזים פחות איכותיים.`,

                    severity: 'medium',
                    confidence: 0.75,
                    expectedImpactKind: 'cpa_reduction',
                    expectedImpactWindowDays: 30,

                    evidenceSnapshot: {
                        asOf: ctx.now.toISOString(),
                        metrics: {
                            platform,
                            conv30d: conv30,
                            spend90dIls: p.spend90dIls,
                            tier: p.tier,
                            trackingHealthy,
                        },
                        window: { start: windowStart, end: windowEnd },
                    },

                    proposedAction: `Switch high-spend campaigns to Target CPA with target = current account CPA. Hold tCPA for 14 days; tCPA needs 1-2 weeks to learn.`,
                    proposedActionHe: `העבירו קמפיינים עם הוצאה גבוהה ל-Target CPA עם יעד = ה-CPA הנוכחי של החשבון. החזיקו tCPA במשך 14 ימים; tCPA צריך 1-2 שבועות ללמוד.`,
                    manualInstructions: buildManualInstructions_switchToTcpa(platform),
                    apiActionRecipe: undefined,

                    testMethod: 'before_after_window',
                    testWindowDays: 28,         // tCPA needs 2 weeks to learn + 2 weeks to measure
                    testSuccessCriteria: {
                        metric: 'cpa_ils',
                        direction: 'decrease',
                        thresholdPct: 8,
                        minConv: 30,
                        minSpendIls: 1000,
                    },

                    source: 'rule_engine',
                })
            }
        }
    }

    return out
}

// ─── Manual instruction builders ─────────────────────────────────────────
function buildManualInstructions_demoteToMaxClicks(platform: string) {
    if (platform === 'meta') {
        return [
            {
                step: 1,
                platformLabel: 'Meta Ads Manager',
                actionLabel: 'Open Ads Manager → Campaigns tab',
                actionLabelHe: 'פתחו את Ads Manager → לשונית Campaigns',
                screenshotHint: 'business.facebook.com/adsmanager',
            },
            {
                step: 2,
                platformLabel: 'Meta Ads Manager',
                actionLabel: 'Select the campaigns with low conversions (filter by Result type)',
                actionLabelHe: 'בחרו את הקמפיינים עם מעט המרות (סננו לפי סוג תוצאה)',
            },
            {
                step: 3,
                platformLabel: 'Meta Ads Manager',
                actionLabel: 'Edit → Campaign objective: keep, but change Bid strategy to "Maximum number of link clicks"',
                actionLabelHe: 'ערוך → מטרת קמפיין: השאירו, אבל שנו אסטרטגיית הצעה ל-"מספר מקסימלי של קליקים על הקישור"',
                verify: 'Verify the bid strategy now shows "Highest volume of link clicks" before saving.',
                verifyHe: 'ודאו שאסטרטגיית ההצעה מציגה כעת "Highest volume of link clicks" לפני השמירה.',
            },
            {
                step: 4,
                platformLabel: 'Meta Ads Manager',
                actionLabel: 'Save. Wait 7 days before evaluating.',
                actionLabelHe: 'שמרו. המתינו 7 ימים לפני הערכה.',
            },
        ]
    }
    // google_ads
    return [
        {
            step: 1,
            platformLabel: 'Google Ads',
            actionLabel: 'Open Google Ads → Campaigns',
            actionLabelHe: 'פתחו את Google Ads → קמפיינים',
            screenshotHint: 'ads.google.com',
        },
        {
            step: 2,
            platformLabel: 'Google Ads',
            actionLabel: 'Select the campaign → Settings → Bidding',
            actionLabelHe: 'בחרו את הקמפיין → הגדרות → הצעות מחיר',
        },
        {
            step: 3,
            platformLabel: 'Google Ads',
            actionLabel: 'Change bid strategy to "Maximize clicks". Optional: set Max CPC bid limit to ~₪10 (or your current avg CPC + 50%).',
            actionLabelHe: 'שנו אסטרטגיית הצעות ל-"Maximize clicks". אופציונלי: הגדירו תקרת Max CPC של ~₪10 (או ה-CPC הממוצע הנוכחי + 50%).',
            verify: 'Verify bid strategy now shows "Maximize clicks" before saving.',
            verifyHe: 'ודאו שאסטרטגיית ההצעה מציגה כעת "Maximize clicks" לפני השמירה.',
        },
        {
            step: 4,
            platformLabel: 'Google Ads',
            actionLabel: 'Save. Wait 14 days before evaluating; Smart Bidding has a learning period when changing strategies.',
            actionLabelHe: 'שמרו. המתינו 14 ימים לפני הערכה; Smart Bidding דורש תקופת למידה בעת שינוי אסטרטגיה.',
        },
    ]
}

function buildManualInstructions_switchToTcpa(platform: string) {
    if (platform === 'meta') {
        return [
            {
                step: 1,
                platformLabel: 'Meta Ads Manager',
                actionLabel: 'First: calculate your account-average CPA from the last 30 days. Sum of spend ÷ sum of conversions.',
                actionLabelHe: 'ראשית: חשבו את ה-CPA הממוצע של החשבון מ-30 הימים האחרונים. סך הוצאה ÷ סך המרות.',
            },
            {
                step: 2,
                platformLabel: 'Meta Ads Manager',
                actionLabel: 'Open the campaign → Edit → Bid strategy: change to "Cost per result goal" and enter the CPA you calculated.',
                actionLabelHe: 'פתחו את הקמפיין → ערוך → אסטרטגיית הצעה: שנו ל-"Cost per result goal" והזינו את ה-CPA שחישבתם.',
                verify: 'Meta will warn if your target is too aggressive — if it does, raise it by 20%.',
                verifyHe: 'Meta יזהיר אם היעד אגרסיבי מדי — אם כן, העלו אותו ב-20%.',
            },
            {
                step: 3,
                platformLabel: 'Meta Ads Manager',
                actionLabel: 'Save. Do NOT make other changes for 14 days — let the algo learn.',
                actionLabelHe: 'שמרו. אל תעשו שינויים נוספים במשך 14 ימים — תנו לאלגוריתם ללמוד.',
            },
        ]
    }
    // google_ads
    return [
        {
            step: 1,
            platformLabel: 'Google Ads',
            actionLabel: 'Calculate your account-average CPA from the last 30 days: Cost ÷ Conversions in the Overview tab.',
            actionLabelHe: 'חשבו את ה-CPA הממוצע של החשבון מ-30 הימים האחרונים: עלות ÷ המרות בלשונית Overview.',
        },
        {
            step: 2,
            platformLabel: 'Google Ads',
            actionLabel: 'Open campaign → Settings → Bidding → Change strategy to "Target CPA" and enter the calculated CPA.',
            actionLabelHe: 'פתחו את הקמפיין → הגדרות → הצעות מחיר → שנו אסטרטגיה ל-"Target CPA" והזינו את ה-CPA שחישבתם.',
            verify: 'Google may suggest a different target — accept Google\'s suggestion if within ±15% of yours; otherwise use yours.',
            verifyHe: 'Google עשוי להציע יעד שונה — קבלו את ההצעה של Google אם היא תוך ±15% משלכם; אחרת השתמשו בשלכם.',
        },
        {
            step: 3,
            platformLabel: 'Google Ads',
            actionLabel: 'Save. Learning period is 7-14 days — do NOT change target during learning.',
            actionLabelHe: 'שמרו. תקופת הלמידה היא 7-14 ימים — אל תשנו את היעד במהלך הלמידה.',
        },
    ]
}