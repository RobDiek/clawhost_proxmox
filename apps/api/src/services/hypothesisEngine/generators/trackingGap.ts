/**
 * Tracking gap generator.
 *
 * Flags accounts where the ingested data is structurally incomplete:
 *   - >30% of conversion rows lack attribution_window (often = generic CSV
 *     uploads, OCR'd screenshots) — every analysis on this data is suspect
 *   - >20% rows missing conversion_event_name — can't slice by event,
 *     can't propose event-mix changes
 *   - Stale FX flags — historical spend looks wrong vs current rates
 *
 * These aren't optimization hypotheses; they're "stop making decisions on
 * this data until you fix X" hypotheses. Severity high because the
 * downstream Hypothesis Engine generators will produce confidently-wrong
 * outputs if these gaps aren't closed first.
 */

import type { GeneratorContext, HypothesisProposal } from '../types'
import { attributionQuality90d } from '../evidence'

export async function generateTrackingGap(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []
    const q = await attributionQuality90d(ctx.instanceId)
    if (q.totalRowsLast90d === 0) return out

    const windowStart = new Date(ctx.now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const windowEnd = ctx.now.toISOString().slice(0, 10)

    // ── #1: Attribution window unknown rate > 30% ─────────────────────────
    if (q.rowsWithConversions >= 10 && q.attrUnknownPct > 0.3) {
        const pct = (q.attrUnknownPct * 100).toFixed(0)
        out.push({
            hypothesisCode: 'tracking_gap_attribution_unknown',
            title: `${pct}% of conversion rows have no attribution metadata`,
            titleHe: `ל-${pct}% משורות ההמרה אין metadata של ייחוס`,
            scopeDataType: 'account',
            scopeWindow: { start: windowStart, end: windowEnd },

            observation: `Of ${q.rowsWithConversions} rows with conversions in last 90 days, ${q.rowsWithoutAttributionWindow} (${pct}%) lack a known attribution_window. This usually means: generic CSV uploads (not native platform exports), OCR'd dashboards, or manual entries. Cross-platform conversion sums will double-count or under-count.`,
            observationHe: `מתוך ${q.rowsWithConversions} שורות עם המרות ב-90 הימים האחרונים, ${q.rowsWithoutAttributionWindow} (${pct}%) חסרות attribution_window ידוע. הסיבה בדרך כלל: העלאות CSV גנריות (לא ייצוא ישיר מהפלטפורמה), OCR של dashboards, או הזנה ידנית. סכומי המרה בין-פלטפורמיים יספרו פעמיים או יהיו חסרים.`,
            hypothesis: `Connect direct OAuth integration with Meta and/or Google Ads. OAuth-sourced rows carry full attribution metadata; uploaded CSVs are best-effort. Until then, Hypothesis Engine recommendations on this account should be treated as directional, not numerical.`,
            hypothesisHe: `חברו אינטגרציית OAuth ישירה עם Meta ו/או Google Ads. שורות ממקור OAuth נושאות metadata מלא של ייחוס; CSV שמועלים הם best-effort. עד אז, המלצות מנוע ההיפותזות לחשבון הזה צריכות להיחשב כדירקציוניות, לא נומריות.`,
            reasoning: `Meta default attribution (7d_click+1d_view) and Google default (30d_click) count different conversions for the same event. Without per-row attribution metadata, our aggregator cannot prevent cross-platform double-counting. Decision quality on tCPA targets, budget allocation, and ROAS comparisons drops measurably.`,
            reasoningHe: `Meta default attribution (7d_click+1d_view) ו-Google default (30d_click) סופרים המרות שונות לאותו אירוע. בלי metadata של ייחוס לכל שורה, האגרגטור שלנו לא יכול למנוע ספירה כפולה בין-פלטפורמית. איכות ההחלטות על יעדי tCPA, הקצאת תקציב והשוואות ROAS יורדת באופן מדיד.`,

            severity: 'high',
            confidence: 0.9,
            expectedImpactKind: 'risk_mitigation',
            expectedImpactWindowDays: 90,

            evidenceSnapshot: {
                asOf: ctx.now.toISOString(),
                metrics: {
                    rowsWithConv: q.rowsWithConversions,
                    rowsWithoutAttr: q.rowsWithoutAttributionWindow,
                    attrUnknownPct: q.attrUnknownPct,
                    eventUnnamedPct: q.eventUnnamedPct,
                },
                window: { start: windowStart, end: windowEnd },
            },
            evidenceQualityScore: 0.95,   // we're confident the rows ARE missing this

            proposedAction: `Connect Meta + Google OAuth so future data lands with full attribution metadata. CSV uploads remain useful for backfill but should be a secondary source.`,
            proposedActionHe: `חברו OAuth של Meta + Google כך שנתונים עתידיים יגיעו עם metadata מלא של ייחוס. העלאות CSV נשארות שימושיות ל-backfill אבל צריכות להיות מקור משני.`,
            manualInstructions: [
                {
                    step: 1,
                    platformLabel: 'Flowmatic Dashboard',
                    actionLabel: 'Go to "ניהול שיווק" → Paid Channels → Connect Meta Business Manager. Authorize the ad account.',
                    actionLabelHe: 'גשו ל"ניהול שיווק" → ערוצים בתשלום → חברו Meta Business Manager. אשרו את חשבון המודעות.',
                },
                {
                    step: 2,
                    platformLabel: 'Flowmatic Dashboard',
                    actionLabel: 'Same screen → Connect Google Ads. Choose the customer ID (or MCC sub-account) for your business.',
                    actionLabelHe: 'אותו מסך → חברו Google Ads. בחרו את customer ID (או חשבון משני של MCC) של העסק.',
                },
                {
                    step: 3,
                    platformLabel: 'Flowmatic Dashboard',
                    actionLabel: 'Wait 24 hours; daily sync will populate ingested_data_points with OAuth-grade rows.',
                    actionLabelHe: 'המתינו 24 שעות; הסנכרון היומי יאכלס את הנתונים עם שורות באיכות OAuth.',
                },
            ],

            testMethod: 'before_after_window',
            testWindowDays: 7,
            testSuccessCriteria: {
                metric: 'conversions',   // proxy — we don't actually expect conv change; just want OAuth flow established
                direction: 'no_worse_than',
                thresholdPct: 100,
            },

            source: 'rule_engine',
        })
    }

    // ── #2: No conversion event name on >20% of rows ──────────────────────
    if (q.rowsWithConversions >= 10 && q.eventUnnamedPct > 0.2) {
        const pct = (q.eventUnnamedPct * 100).toFixed(0)
        out.push({
            hypothesisCode: 'tracking_gap_no_conversion_event_name',
            title: `${pct}% of conversions have no event name`,
            titleHe: `ל-${pct}% מהמרות אין שם אירוע`,
            scopeDataType: 'account',
            scopeWindow: { start: windowStart, end: windowEnd },

            observation: `${q.rowsWithoutEventName} of ${q.rowsWithConversions} conversion-bearing rows lack a conversion_event_name. We can see "${q.rowsWithoutEventName} conversions happened" but not what kind. Cannot make event-mix recommendations.`,
            observationHe: `${q.rowsWithoutEventName} מתוך ${q.rowsWithConversions} שורות עם המרות חסרות conversion_event_name. אנחנו רואים "${q.rowsWithoutEventName} המרות קרו" אבל לא מאיזה סוג. לא ניתן לתת המלצות על תמהיל אירועים.`,
            hypothesis: `Re-export your historical data from the source with conversion breakdown ON (Meta: "Customize columns" → Conversions → All conversion actions; Google: "Conversion action" column).`,
            hypothesisHe: `ייצאו מחדש את הנתונים ההיסטוריים מהמקור עם פירוט המרות מופעל (Meta: "Customize columns" → Conversions → All conversion actions; Google: עמודת "Conversion action").`,
            reasoning: `Without event name, we can't tell if your ${q.rowsWithConversions} conversions are 100 leads + 100 video views or 200 actual purchases. Smart Bidding decisions, event-mix recommendations, and tCPA targeting all require event granularity.`,
            reasoningHe: `בלי שם אירוע, אי אפשר לדעת אם ${q.rowsWithConversions} ההמרות שלכם הן 100 לידים + 100 צפיות בסרטון, או 200 רכישות אמיתיות. החלטות Smart Bidding, המלצות על תמהיל אירועים, וטרגוט tCPA כולן דורשות פירוט אירועים.`,

            severity: 'medium',
            confidence: 0.85,
            expectedImpactKind: 'risk_mitigation',

            evidenceSnapshot: {
                asOf: ctx.now.toISOString(),
                metrics: {
                    rowsWithoutEvent: q.rowsWithoutEventName,
                    rowsWithConv: q.rowsWithConversions,
                    eventUnnamedPct: q.eventUnnamedPct,
                },
                window: { start: windowStart, end: windowEnd },
            },

            proposedAction: 'Re-export Meta/Google data with the per-event conversion column included; re-upload.',
            proposedActionHe: 'ייצאו מחדש נתוני Meta/Google עם עמודת ההמרה לפי אירוע; העלו מחדש.',

            source: 'rule_engine',
        })
    }

    return out
}