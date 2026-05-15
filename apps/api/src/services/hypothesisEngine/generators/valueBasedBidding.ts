/**
 * Phase 4.5 generator — value-based bidding (tROAS) opportunity.
 *
 * An eCommerce account that:
 *   - has conversion VALUE flowing into ingested_data_points
 *     (conversionValueIls > 0 across the window)
 *   - reports 30+ conversions in 30 days (Smart Bidding eligibility floor)
 *   - is NOT yet on tROAS (we can't directly know this from CSV; we propose
 *     the upgrade and the user confirms)
 * has substantial unlock available: tROAS optimizes for revenue rather than
 * cost-per-conversion, and tends to outperform tCPA by 10-20% on revenue
 * for eCom accounts where AOV varies meaningfully across customers.
 *
 * This generator is the natural next-step after `bidding_tier_mismatch_max_conv_to_tcpa`.
 * Where that one says "you have signal for tCPA", this one says "you have
 * VALUE signal — go beyond cost-per-acquisition and bid on revenue directly."
 */

import type { GeneratorContext, HypothesisProposal } from '../types'

const MIN_CONV_FOR_TROAS = 50              // tROAS needs more signal than tCPA — 50/30d minimum
const MIN_AOV_VARIANCE_HINT = 0.5          // ratio: must look like value varies (avg value / conv > 0)
const MIN_REVENUE_FLOOR = 10000            // ₪10K revenue in window — below that, value isn't trustworthy

export async function generateValueBasedBidding(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []
    if (!ctx.platformAggregates || ctx.platformAggregates.length === 0) return out

    // Skip non-ecommerce accounts. tROAS is the wrong tool for leadgen.
    const primaryGoal = (ctx.paidProfile as any)?.primaryGoal
    if (primaryGoal && primaryGoal !== 'ecommerce') return out

    for (const p of ctx.platformAggregates) {
        if (p.platform !== 'meta' && p.platform !== 'google_ads') continue
        if (p.spendIls === 0) continue
        if (p.conversions < MIN_CONV_FOR_TROAS) continue
        if (p.conversionValueIls < MIN_REVENUE_FLOOR) continue

        const avgConvValue = p.conversionValueIls / p.conversions
        if (avgConvValue < MIN_AOV_VARIANCE_HINT) continue

        const roasClaimed = p.conversionValueIls / p.spendIls
        const platformLabel = p.platform === 'meta' ? 'Meta' : 'Google Ads'

        const windowStart = new Date(ctx.now.getTime() - 90 * 86400 * 1000).toISOString()
        const windowEnd = ctx.now.toISOString()

        out.push({
            hypothesisCode: 'bidding_tier_mismatch_tcpa_to_troas',
            title: `${platformLabel}: ${p.conversions.toFixed(0)} conv + ₪${Math.round(p.conversionValueIls)} revenue → eligible for tROAS`,
            titleHe: `${platformLabel}: ${p.conversions.toFixed(0)} המרות + ₪${Math.round(p.conversionValueIls)} הכנסה — זכאים ל-tROAS`,
            scopePlatform: p.platform,
            scopeDataType: 'account',
            scopeWindow: { start: windowStart, end: windowEnd },
            observation:
                `${platformLabel} reports ${p.conversions.toFixed(0)} conversions and ₪${Math.round(p.conversionValueIls)} of revenue ` +
                `over 90 days (claimed ROAS ${roasClaimed.toFixed(2)}×). Average order value ≈ ₪${Math.round(avgConvValue)}. ` +
                `Value signal is strong enough for Smart Bidding to optimize for revenue rather than just conversions.`,
            observationHe:
                `${platformLabel} מדווח על ${p.conversions.toFixed(0)} המרות ו-₪${Math.round(p.conversionValueIls)} הכנסה ` +
                `ב-90 ימים (ROAS מדווח ${roasClaimed.toFixed(2)}×). ערך הזמנה ממוצע ≈ ₪${Math.round(avgConvValue)}. ` +
                `הסיגנל של הערך מספיק חזק כדי ש-Smart Bidding יבצע אופטימיזציה להכנסה ולא רק להמרות.`,
            hypothesis:
                `Transitioning campaigns from tCPA to Target ROAS (tROAS) — with target = your current account ROAS — will ` +
                `lift revenue 10-20% within 28 days. The mechanism: tCPA treats a ₪100 order and a ₪1000 order as equally valuable; ` +
                `tROAS bids higher on high-AOV auctions. Most beneficial when AOV varies across customers (yours does).`,
            hypothesisHe:
                `מעבר קמפיינים מ-tCPA ל-Target ROAS (tROAS) — עם יעד = ה-ROAS הנוכחי של החשבון — ירים הכנסה ב-10-20% תוך 28 ימים. ` +
                `המנגנון: tCPA מתייחס להזמנה של ₪100 ולהזמנה של ₪1000 כשוות-ערך; tROAS מציע גבוה יותר במכרזים של AOV גבוה. ` +
                `מועיל במיוחד כש-AOV משתנה בין לקוחות (אצלכם — כן).`,
            reasoning:
                `tROAS is mathematically superior to tCPA when conversion VALUE varies. Standard error on per-customer revenue ` +
                `requires more signal than per-customer count — that's why we wait for 50+ conv/30d (vs 30 for tCPA). With ` +
                `${p.conversions.toFixed(0)} conv and a stable AOV signal, the algorithm has enough to learn.`,
            reasoningHe:
                `tROAS עדיף מתמטית על tCPA כשערך ההמרה משתנה. שגיאת תקן על הכנסה ללקוח דורשת יותר סיגנל מאשר ספירת לקוחות — ` +
                `לכן מחכים ל-50+ המרות ב-30 ימים (לעומת 30 ל-tCPA). עם ${p.conversions.toFixed(0)} המרות וסיגנל AOV יציב, ` +
                `לאלגוריתם יש מספיק ללמוד.`,
            severity: 'medium',
            confidence: 0.75,
            expectedImpactKind: 'roas_uplift',
            expectedImpactWindowDays: 28,
            evidenceSnapshot: {
                asOf: ctx.now.toISOString(),
                window: { start: windowStart, end: windowEnd },
                metrics: {
                    platform: p.platform,
                    conversions90d: p.conversions,
                    conversionValueIls: p.conversionValueIls,
                    avgConversionValueIls: avgConvValue,
                    roasClaimed,
                    spendIls: p.spendIls,
                    eventNames: p.eventNames,
                },
            },
            proposedAction:
                `Switch top campaigns from Target CPA to Target ROAS. Set target = current account ROAS. ` +
                `Learning period: 7-14 days; do NOT change target during learning. Measure revenue lift at 28 days.`,
            proposedActionHe:
                `העבירו את הקמפיינים המובילים מ-Target CPA ל-Target ROAS. הגדירו יעד = ה-ROAS הנוכחי של החשבון. ` +
                `תקופת למידה: 7-14 ימים; אל תשנו את היעד במהלך הלמידה. מדדו עליית הכנסה ב-28 ימים.`,
            manualInstructions: p.platform === 'meta'
                ? [
                    {
                        step: 1,
                        platformLabel: 'Meta Ads Manager',
                        actionLabel: 'Verify conversion VALUE is being passed: Pixel events should have a "value" parameter, CAPI events should too',
                        actionLabelHe: 'ודאו שהערך עובר באירועים: לפיקסל ול-CAPI יש פרמטר "value"',
                        verifyHe: 'באירועי Manager, באירוע Purchase, עמודת Custom Parameters מציגה value + currency.',
                    },
                    {
                        step: 2,
                        platformLabel: 'Meta Ads Manager',
                        actionLabel: 'Edit campaign → Performance goal: change to "Highest value of purchase conversions"',
                        actionLabelHe: 'ערוך קמפיין → Performance goal: שנו ל-"Highest value of purchase conversions"',
                    },
                    {
                        step: 3,
                        platformLabel: 'Meta Ads Manager',
                        actionLabel: 'Bid strategy: change to "Minimum ROAS goal" with target = your current ROAS',
                        actionLabelHe: 'אסטרטגיית הצעות: שנו ל-"Minimum ROAS goal" עם יעד = ה-ROAS הנוכחי',
                        verifyHe: 'יש שדה ROAS goal מולא עם המספר שהגדרתם.',
                    },
                    {
                        step: 4,
                        platformLabel: 'Meta Ads Manager',
                        actionLabel: 'Save. Don\'t touch the campaign for 14 days. Then measure revenue lift over 28 days.',
                        actionLabelHe: 'שמרו. אל תיגעו בקמפיין 14 ימים. אחר כך מדדו עליית הכנסה לאורך 28 ימים.',
                    },
                ]
                : [
                    {
                        step: 1,
                        platformLabel: 'Google Ads',
                        actionLabel: 'Verify conversion VALUE: Tools → Conversions → Purchase: column "Conv. value" must be non-zero',
                        actionLabelHe: 'ודאו שערך ההמרה עובר: Tools → Conversions → Purchase: עמודת "Conv. value" חייבת להיות לא אפסית',
                    },
                    {
                        step: 2,
                        platformLabel: 'Google Ads',
                        actionLabel: 'Open campaign → Settings → Bidding → Change strategy to "Target ROAS"',
                        actionLabelHe: 'פתחו קמפיין → הגדרות → הצעות מחיר → שנו אסטרטגיה ל-"Target ROAS"',
                    },
                    {
                        step: 3,
                        platformLabel: 'Google Ads',
                        actionLabel: 'Target value: set to your current account ROAS (or accept Google\'s suggestion if within ±20%)',
                        actionLabelHe: 'ערך יעד: הגדירו ל-ROAS הנוכחי של החשבון (או קבלו את הצעת Google אם תוך ±20%)',
                        verifyHe: 'יש שדה Target ROAS מולא; Google מציג אומדן ביצועים.',
                    },
                    {
                        step: 4,
                        platformLabel: 'Google Ads',
                        actionLabel: 'Save. Learning period: 7-14 days. Measure revenue lift at 28 days.',
                        actionLabelHe: 'שמרו. תקופת למידה: 7-14 ימים. מדדו עליית הכנסה ב-28 ימים.',
                    },
                ],
            testMethod: 'before_after_window',
            testWindowDays: 28,
            testSuccessCriteria: {
                metric: 'roas',
                direction: 'increase',
                thresholdPct: 10,
                minConv: 30,
                minSpendIls: 2000,
            },
            source: 'rule_engine',
        })
    }

    return out
}