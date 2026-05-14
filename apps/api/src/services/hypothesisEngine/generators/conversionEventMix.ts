/**
 * Conversion event mix generator.
 *
 * Detects misalignment between stated marketing goal and the conversion
 * events actually being optimized for. Common SMB pattern: business wants
 * leads/sales but Meta campaigns optimize for `messaging_conversation_started`
 * because "WhatsApp leads are cheap". Result: high volume of low-intent
 * conversations that don't close, vs fewer but higher-intent leads via form
 * fills.
 *
 * Detection logic:
 *   1. Compare marketing_goal (declared) vs dominant conversion_event_name (observed)
 *   2. If declared = leads/sales, but ≥50% of platform conversions are
 *      messaging/page_engagement/video_view → flag as off-objective
 *   3. If ANY conversion event has <30 conv/30d AND is dominant → thin-signal
 *      hypothesis (Smart Bidding won't stabilize on this event)
 */

import type { GeneratorContext, HypothesisProposal } from '../types'

const LOW_INTENT_EVENTS = new Set([
    'messaging_conversation_started',
    'messaging_first_reply',
    'page_engagement',
    'video_view',
    'link_click',
    'post_engagement',
    'page_like',
])

const HIGH_INTENT_EVENTS = new Set([
    'lead',
    'purchase',
    'complete_registration',
    'initiate_checkout',
])

function isGoalLeadsOrSales(goal: string): boolean {
    const g = goal.toLowerCase()
    return /lead|sales|purchase|sign[\s-]?up|registration|לידים|מכירות|רכישה|רישום/.test(g)
}

export async function generateConversionEventMix(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []
    if (ctx.eventBreakdown.length === 0) return out

    const windowStart = new Date(ctx.now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const windowEnd = ctx.now.toISOString().slice(0, 10)

    const declaredGoalsLowIntent = ctx.marketingGoals.some(isGoalLeadsOrSales)

    // Group event breakdown by platform
    const byPlatform = new Map<string, typeof ctx.eventBreakdown>()
    for (const r of ctx.eventBreakdown) {
        if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, [])
        byPlatform.get(r.platform)!.push(r)
    }

    for (const [platform, rows] of byPlatform.entries()) {
        const totalConv = rows.reduce((s, r) => s + r.conversions, 0)
        if (totalConv < 30) continue   // not enough data

        const platformLabel = platform === 'meta' ? 'Meta' : platform === 'google_ads' ? 'Google Ads' : platform

        // Aggregate per-event
        const perEvent = new Map<string, { conv: number; spend: number; convValue: number }>()
        for (const r of rows) {
            const k = r.eventName
            const prev = perEvent.get(k) || { conv: 0, spend: 0, convValue: 0 }
            prev.conv += r.conversions
            prev.spend += r.spendIls
            prev.convValue += r.conversionValueIls
            perEvent.set(k, prev)
        }

        // Find dominant event
        let dominantEvent = ''
        let dominantConv = 0
        for (const [evName, ev] of perEvent.entries()) {
            if (ev.conv > dominantConv) {
                dominantConv = ev.conv
                dominantEvent = evName
            }
        }
        if (!dominantEvent) continue

        const dominantShare = dominantConv / totalConv
        const dominantData = perEvent.get(dominantEvent)!

        // ── Hypothesis 1: goal/event mismatch ─────────────────────────────
        if (declaredGoalsLowIntent && LOW_INTENT_EVENTS.has(dominantEvent) && dominantShare >= 0.5) {
            out.push({
                hypothesisCode: 'conversion_event_mix_off_objective',
                title: `${platformLabel}: optimizing for "${dominantEvent}" but goal is leads/sales`,
                titleHe: `${platformLabel}: אופטימיזציה ל-"${dominantEvent}" בעוד שהמטרה היא לידים/מכירות`,
                scopePlatform: platform,
                scopeDataType: 'event',
                scopeEventName: dominantEvent,
                scopeWindow: { start: windowStart, end: windowEnd },

                observation: `${(dominantShare * 100).toFixed(0)}% of ${platformLabel} conversions are "${dominantEvent}" (${dominantConv.toFixed(0)} events, ₪${dominantData.spend.toFixed(0)} spent). But declared marketing goal is leads/sales — these are low-intent signals.`,
                observationHe: `${(dominantShare * 100).toFixed(0)}% מההמרות ב-${platformLabel} הן "${dominantEvent}" (${dominantConv.toFixed(0)} אירועים, ₪${dominantData.spend.toFixed(0)} הוצאה). אבל המטרה השיווקית המוצהרת היא לידים/מכירות — אלה סיגנלים של intent נמוך.`,
                hypothesis: `Smart Bidding is learning to find people who'll START a WhatsApp chat / click a link / view a video — not people who'll convert to actual leads. Re-optimize for the high-intent event (Lead form submission / Purchase) and accept ~3-5× higher CPA on paper, but the conversions will be 2-4× more likely to close.`,
                hypothesisHe: `Smart Bidding לומד למצוא אנשים שיתחילו צ'אט בוואטסאפ / יקליקו על קישור / יצפו בסרטון — לא אנשים שיהפכו ללידים אמיתיים. הגדירו אופטימיזציה לאירוע intent גבוה (טופס Lead / Purchase) וקבלו CPA גבוה פי ~3-5 על הנייר, אבל ההמרות יסגרו פי 2-4 יותר.`,
                reasoning: `Meta's algorithm trains on whatever conversion event is selected. With ${dominantEvent}, the algorithm finds users likely to engage casually — that's the cheapest population. The actual close rate from WhatsApp conversations is typically 5-15% (vs 40-60% on form-submitted leads). Net economics: cheap top-funnel events ≠ cheap actual customers.`,
                reasoningHe: `האלגוריתם של Meta מתאמן על כל אירוע המרה שנבחר. עם ${dominantEvent}, האלגוריתם מוצא משתמשים שסביר שיתערבו באופן רגיל — זו האוכלוסייה הזולה ביותר. שיעור הסגירה בפועל משיחות וואטסאפ הוא בדרך כלל 5-15% (לעומת 40-60% על לידים מטופס). כלכלה נקייה: אירועי top-funnel זולים ≠ לקוחות אמיתיים זולים.`,

                severity: 'high',
                confidence: 0.7,
                expectedImpactKind: 'conv_uplift',
                expectedImpactWindowDays: 30,

                evidenceSnapshot: {
                    asOf: ctx.now.toISOString(),
                    metrics: {
                        platform,
                        dominantEvent,
                        dominantConv,
                        dominantSharePct: Number((dominantShare * 100).toFixed(1)),
                        totalConv,
                        spendIls: dominantData.spend,
                        declaredMarketingGoals: ctx.marketingGoals,
                        availableEvents: Array.from(perEvent.keys()),
                    },
                    window: { start: windowStart, end: windowEnd },
                },

                proposedAction: `Switch optimization event from "${dominantEvent}" to "Lead" (form submission) or "Purchase". Verify conversion event is firing first.`,
                proposedActionHe: `החליפו את אירוע האופטימיזציה מ-"${dominantEvent}" ל-"Lead" (טופס) או "Purchase". ודאו קודם שאירוע ההמרה נורה.`,
                manualInstructions: platform === 'meta' ? [
                    {
                        step: 1,
                        platformLabel: 'Meta Events Manager',
                        actionLabel: 'Open Events Manager → verify Lead / Purchase event is set up and firing (test events for at least 1 manual test).',
                        actionLabelHe: 'פתחו Events Manager → ודאו שאירוע Lead / Purchase מוגדר ויורה (test events לפחות בדיקה ידנית אחת).',
                    },
                    {
                        step: 2,
                        platformLabel: 'Meta Ads Manager',
                        actionLabel: 'Duplicate the campaign (don\'t edit live — fresh learning period anyway). On the duplicate, change Performance Goal to "Maximize number of Leads" (or Purchases).',
                        actionLabelHe: 'שכפלו את הקמפיין (אל תערכו ב-live — בכל מקרה תקופת למידה חדשה). על השכפול, שנו את Performance Goal ל-"Maximize number of Leads" (או רכישות).',
                    },
                    {
                        step: 3,
                        platformLabel: 'Meta Ads Manager',
                        actionLabel: 'Launch the duplicate at 30% of original budget. Pause the original after 7 days IF duplicate generates ≥5 leads.',
                        actionLabelHe: 'הפעילו את השכפול ב-30% מהתקציב המקורי. השהו את המקורי אחרי 7 ימים אם השכפול מייצר 5+ לידים.',
                    },
                ] : [
                    {
                        step: 1,
                        platformLabel: 'Google Tag Manager',
                        actionLabel: 'Verify a high-intent conversion (form submit / phone call / purchase) is configured in GTM and firing.',
                        actionLabelHe: 'ודאו שמוגדרת המרה של intent גבוה (שליחת טופס / שיחת טלפון / רכישה) ב-GTM ויורה.',
                    },
                    {
                        step: 2,
                        platformLabel: 'Google Ads',
                        actionLabel: 'Open Tools → Conversions → mark the high-intent event as Primary; demote low-intent to Secondary.',
                        actionLabelHe: 'פתחו Tools → Conversions → סמנו את האירוע intent גבוה כ-Primary; הורידו את הנמוך ל-Secondary.',
                        verify: 'Only the high-intent action should have a "Primary" badge.',
                        verifyHe: 'רק לפעולה של intent גבוה צריך להיות תג "Primary".',
                    },
                    {
                        step: 3,
                        platformLabel: 'Google Ads',
                        actionLabel: 'Wait 14 days for Smart Bidding to re-learn against the new primary event.',
                        actionLabelHe: 'המתינו 14 ימים ש-Smart Bidding ילמד מחדש מול האירוע הראשי החדש.',
                    },
                ],

                testMethod: 'before_after_window',
                testWindowDays: 28,
                testSuccessCriteria: {
                    metric: 'conversions',
                    direction: 'increase',
                    thresholdPct: 20,
                    minConv: 15,
                    minSpendIls: 1500,
                },

                source: 'rule_engine',
            })
        }

        // ── Hypothesis 2: thin signal on optimization event ───────────────
        // The dominant event has <30 conv/30d (90d) — Smart Bidding will struggle.
        // 90d threshold: 90 conv / 90d ≈ 30 conv / 30d. We don't have per-event 30d,
        // so approximate with 90d/3.
        const dominant30dApprox = dominantConv / 3
        if (dominant30dApprox < 15 && totalConv >= 15) {
            out.push({
                hypothesisCode: 'conversion_event_thin_signal',
                title: `${platformLabel}: "${dominantEvent}" has ~${dominant30dApprox.toFixed(0)} conv/30d — Smart Bidding underfed`,
                titleHe: `${platformLabel}: ל-"${dominantEvent}" יש ~${dominant30dApprox.toFixed(0)} המרות ב-30 ימים — Smart Bidding מורעב`,
                scopePlatform: platform,
                scopeDataType: 'event',
                scopeEventName: dominantEvent,
                scopeWindow: { start: windowStart, end: windowEnd },

                observation: `Dominant optimization event "${dominantEvent}" gets ~${dominant30dApprox.toFixed(0)} conversions/30d (extrapolated from ${dominantConv.toFixed(0)} in 90d). Standard error of CVR at n=15 is ~25%; algorithm cannot stabilize.`,
                observationHe: `אירוע האופטימיזציה הדומיננטי "${dominantEvent}" מקבל ~${dominant30dApprox.toFixed(0)} המרות ב-30 ימים (מהאקסטרפולציה של ${dominantConv.toFixed(0)} ב-90 ימים). שגיאת תקן של CVR ב-n=15 היא ~25%; האלגוריתם לא יכול להתייצב.`,
                hypothesis: `Either: (a) merge this with another conversion event so the combined volume exceeds 30/30d, OR (b) demote to Maximize Clicks until volume builds. Continuing on this event = burning budget on a signal that's mathematically noise.`,
                hypothesisHe: `או: (א) מזגו את האירוע הזה עם אירוע המרה אחר כך שהנפח המשולב יחצה 30 ב-30 ימים, או (ב) רדו ל-Maximize Clicks עד שהנפח גדל. המשך על האירוע הזה = שריפת תקציב על סיגנל שמתמטית הוא רעש.`,
                reasoning: `n=15 conv/30d is the Smart Bidding floor (Optmyzr + Google Ads support docs). Below that, daily bid adjustments swing by ±25-40% on random variance. Either consolidate events to increase n, or accept the cold-start posture and stay on Max Clicks until n=15+.`,
                reasoningHe: `n=15 המרות ב-30 ימים זו רצפת Smart Bidding (Optmyzr + תיעוד תמיכה של Google Ads). מתחת לזה, התאמות יומיות של הצעות מטלטלות ב-±25-40% מסטיות אקראיות. או איחדו אירועים להגדלת n, או קבלו את פוסטור cold-start והישארו על Max Clicks עד n=15+.`,

                severity: 'medium',
                confidence: 0.75,
                expectedImpactKind: 'cpa_reduction',

                evidenceSnapshot: {
                    asOf: ctx.now.toISOString(),
                    metrics: {
                        platform,
                        dominantEvent,
                        dominantConv90d: dominantConv,
                        dominantConv30dApprox: Number(dominant30dApprox.toFixed(1)),
                        smartBiddingFloor: 15,
                    },
                    window: { start: windowStart, end: windowEnd },
                },

                proposedAction: 'Consolidate conversion events OR switch to Maximize Clicks until volume builds.',
                proposedActionHe: 'איחדו אירועי המרה או עברו ל-Maximize Clicks עד שהנפח גדל.',

                testMethod: 'before_after_window',
                testWindowDays: 14,
                testSuccessCriteria: {
                    metric: 'cpa_ils',
                    direction: 'decrease',
                    thresholdPct: 10,
                    minConv: 5,
                    minSpendIls: 300,
                },

                source: 'rule_engine',
            })
        }
    }

    return out
}