/**
 * Phase 4.4 generator — geo holdout experiment trigger.
 *
 * Cross-platform attribution gaps and modeled-heavy data can't be resolved by
 * more dashboarding — the only way to measure true incrementality is to TURN
 * OFF spend in part of the geography and compare. This generator fires when
 * the account has enough spend and trust ambiguity to justify a 4-week geo
 * experiment, and emits a structured test recipe.
 *
 * Trigger conditions (any TWO must be true):
 *   - Composite trust score < 0.5
 *   - Double-count gap > 50% (or null but only paid platforms active)
 *   - At least one modeled_platform / inferred trust tier with significant spend
 *   - Monthly spend ≥ ₪10,000 (below that, geo holdout produces noisy results)
 *
 * Israel-specific design — splits into "Central + Tel Aviv" vs "Periphery"
 * (Jerusalem + North + South) so the holdout retains population balance.
 */

import type { GeneratorContext, HypothesisProposal } from '../types'

const MIN_MONTHLY_SPEND = 10000              // ₪10K/mo floor for meaningful geo split

export async function generateGeoExperimentTrigger(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []
    const t = ctx.truth
    if (!t) return out

    const m = t.mer
    if (!m || m.quality.spendTotalIsZero) return out

    // Extrapolate window spend to monthly basis (30d window already).
    const monthlySpend = m.spendTotalIls * (30 / m.windowDays)
    if (monthlySpend < MIN_MONTHLY_SPEND) return out

    // Count signals.
    let signals = 0
    const reasons: string[] = []

    if (t.trust.compositeScore < 0.5) {
        signals++
        reasons.push(`composite trust score = ${t.trust.compositeScore.toFixed(2)} (< 0.5)`)
    }
    if (m.doubleCountGapPct !== null && m.doubleCountGapPct > 50) {
        signals++
        reasons.push(`attribution gap = ${m.doubleCountGapPct.toFixed(0)}% (> 50%)`)
    }
    const hasLowTrustPlatformWithSpend = t.trust.perPlatform.some(p => {
        const inBreakdown = m.platformBreakdown.find(pb => pb.platform === p.platform)
        return (p.tier === 'modeled_platform' || p.tier === 'inferred') &&
               (inBreakdown?.share || 0) > 0.20
    })
    if (hasLowTrustPlatformWithSpend) {
        signals++
        const weak = t.trust.perPlatform.find(p => p.tier === 'modeled_platform' || p.tier === 'inferred')
        reasons.push(`${weak?.platform || 'a platform'} has low-trust data and >20% of spend`)
    }

    if (signals < 2) return out

    const windowStart = new Date(Date.now() - m.windowDays * 86400 * 1000).toISOString()
    const windowEnd = new Date().toISOString()
    const monthlySpendRounded = Math.round(monthlySpend / 100) * 100
    const projectedAtRisk = Math.round((m.revenueClaimedIls - (m.revenueObservedIls || m.revenueClaimedIls * 0.7)) / m.windowDays * 30)

    out.push({
        hypothesisCode: 'cross_platform_truth_geo_experiment',
        title: 'Geo holdout experiment recommended — attribution trust insufficient',
        titleHe: 'מומלץ ניסוי חתכי-גיאוגרפיה (Geo Holdout) — אמינות הייחוס לא מספקת',
        scopePlatform: null as any,
        scopeWindow: { start: windowStart, end: windowEnd },
        observation:
            `Monthly spend ≈ ₪${monthlySpendRounded.toLocaleString()} with ${signals} attribution-trust ` +
            `warning signals: ${reasons.join('; ')}.`,
        observationHe:
            `תקציב חודשי משוער ₪${monthlySpendRounded.toLocaleString()} עם ${signals} סיגנלי-אמון שליליים: ` +
            reasons.map(r => {
                if (r.startsWith('composite trust score')) return `ציון אמון מצרפי = ${t.trust.compositeScore.toFixed(2)} (מתחת ל-0.5)`
                if (r.startsWith('attribution gap')) return `פער ייחוס = ${(m.doubleCountGapPct || 0).toFixed(0)}% (מעל 50%)`
                return r.replace('has low-trust data and >20% of spend', 'בעלת נתונים מודליים ומעל 20% מהתקציב')
            }).join('; ') + '.',
        hypothesis:
            'A 4-week geo holdout — pause paid ads in 30% of Israeli regions and compare incremental ' +
            'conversions vs. control — will reveal what share of platform-claimed conversions are ' +
            'truly incremental vs. attributed-but-not-caused.',
        hypothesisHe:
            'ניסוי Geo Holdout ל-4 שבועות — השעיית פרסום בערים שמהוות 30% מהמדינה והשוואת תוצאות לאזורים הפועלים — ' +
            'תחשוף איזה חלק מהקונברסיות שהפלטפורמות מדווחות באמת תוספתיות לעומת כאלה שיוחסו אך לא נגרמו על-ידי הפרסום.',
        reasoning:
            'Modeled/inferred data tiers cannot be validated against the platform that produced them. ' +
            'Geo holdout is the only experimental design that establishes causality. Israeli ad market ' +
            'is small enough that a 30/70 split provides statistical power within 4 weeks at this spend level.',
        reasoningHe:
            'נתונים מודליים/משוערכים אינם ניתנים לאימות על-ידי הפלטפורמה שהפיקה אותם. Geo Holdout הוא ' +
            'התכנון הניסויי היחיד שמייצר סיבתיות. שוק הפרסום הישראלי קטן מספיק שחלוקה 30/70 מספקת כוח ' +
            'סטטיסטי תוך 4 שבועות ברמת התקציב הזו.',
        severity: 'high',
        confidence: 0.80,
        expectedImpactIls: projectedAtRisk > 0 ? projectedAtRisk : undefined,
        expectedImpactKind: 'spend_reduction',
        expectedImpactWindowDays: 28,
        evidenceSnapshot: {
            asOf: new Date().toISOString(),
            window: { start: windowStart, end: windowEnd },
            metrics: {
                monthlySpendIls: monthlySpend,
                compositeTrustScore: t.trust.compositeScore,
                doubleCountGapPct: m.doubleCountGapPct,
                signalsCount: signals,
                signalsList: reasons,
                merClaimed: m.mer,
                merObserved: m.merObserved,
            },
        },
        proposedAction:
            'Run a 4-week geo holdout: pause all paid ads in Periphery regions (Jerusalem, North, South) — ' +
            '~30% of population. Keep Central + Tel Aviv running. Compare conversion rates in observed channel ' +
            '(GA4) between paused and active regions. The incremental ratio = (control_conv - holdout_conv) / control_conv.',
        proposedActionHe:
            'הריצו ניסוי Geo Holdout ל-4 שבועות: השעו פרסום בכל הפלטפורמות באזורי הפריפריה ' +
            '(ירושלים, צפון, דרום) — ~30% מהאוכלוסייה. השאירו פעיל בלבד באזור המרכז ותל-אביב. ' +
            'השוו שיעור קונברסיה ב-GA4 בין האזורים. היחס התוספתי = (בקרה − ניסוי) / בקרה.',
        manualInstructions: [
            {
                step: 1,
                platformLabel: 'Meta Ads Manager + Google Ads',
                actionLabel: 'Create a copy of each active campaign and apply geo exclusion to Periphery regions',
                actionLabelHe: 'צרו עותק של כל קמפיין פעיל והגדירו exclusions גיאוגרפיים לאזורי הפריפריה',
                verifyHe: 'בכרטיסיית Locations נראה: Excluded = Jerusalem District + Northern District + Southern District.',
            },
            {
                step: 2,
                platformLabel: 'Meta Ads Manager + Google Ads',
                actionLabel: 'Pause original campaigns; launch geo-restricted copies',
                actionLabelHe: 'השהו את הקמפיינים המקוריים והפעילו את הגרסאות המוגבלות גיאוגרפית',
                verifyHe: 'הקמפיינים החדשים פעילים, המקוריים מוצגים כ-Paused.',
            },
            {
                step: 3,
                platformLabel: 'GA4',
                actionLabel: 'Create two audience segments: Central+TLV (control) and Periphery (holdout)',
                actionLabelHe: 'צרו שני סגמנטים: מרכז+תל-אביב (בקרה) ופריפריה (ניסוי) באמצעות City dimension',
                verifyHe: 'בדוח Acquisition → User Acquisition אפשר לסנן לפי כל סגמנט בנפרד.',
            },
            {
                step: 4,
                platformLabel: 'GA4',
                actionLabel: 'Record baseline conversion rates per segment for 7 days before launch',
                actionLabelHe: 'תעדו שיעור קונברסיה בסיסי לכל סגמנט ב-7 הימים שלפני ההשקה',
                verifyHe: 'יש מספרים מתועדים לכל אחד מהסגמנטים — נשתמש בהם כ-baseline.',
            },
            {
                step: 5,
                platformLabel: 'GA4',
                actionLabel: 'After 4 weeks, compute incremental lift: (control_conv_rate − holdout_conv_rate) / control_conv_rate',
                actionLabelHe: 'אחרי 4 שבועות, חשבו את ה-Lift התוספתי: (בקרה − ניסוי) / בקרה',
                verifyHe: 'אם ה-Lift נמוך מ-20%, חלק ניכר מהקונברסיות שהפלטפורמות דווחו לא היו תוספתיות.',
            },
        ],
        testMethod: 'holdout',
        testWindowDays: 28,
        testSuccessCriteria: {
            metric: 'conversions',
            direction: 'no_worse_than',
            thresholdPct: 70,
            minConv: 30,
        },
        source: 'rule_engine',
    })
    return out
}