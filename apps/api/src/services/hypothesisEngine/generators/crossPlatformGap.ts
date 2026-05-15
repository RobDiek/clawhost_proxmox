/**
 * Phase 4.4 generator — cross-platform truth gap.
 *
 * Fires when the platform-claimed revenue significantly exceeds the observed
 * revenue (from GA4 / server-side). This is the smoking gun for attribution
 * double-counting: Meta and Google each claim credit for the same purchase
 * under their own attribution windows.
 *
 * Severity tiers (driven by gap percentage):
 *   - gap > 100% (claimed is 2× observed): CRITICAL
 *   - gap > 50%:                            HIGH
 *   - gap > 20%:                            MEDIUM
 *   - gap < 20% or no observed channel:     skip (either fine or not measurable)
 *
 * Skip conditions:
 *   - Single paid platform active (no cross-platform overlap to dispute)
 *   - No observed channel connected (no canonical revenue to compare against)
 *   - Total spend < ₪1,000 in the window (not enough volume for the signal)
 *
 * The hypothesis carries a reallocation recommendation: scale down spend on
 * the platform with the lowest trust score until the gap closes, then re-test.
 */

import type { GeneratorContext, HypothesisProposal } from '../types'

const SPEND_MIN_FOR_SIGNAL = 1000     // ₪1,000 minimum window-spend before we trust the gap signal

export async function generateCrossPlatformGap(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []
    const t = ctx.truth
    if (!t) return out

    const m = t.mer
    if (!m || m.quality.spendTotalIsZero) return out
    if (m.spendTotalIls < SPEND_MIN_FOR_SIGNAL) return out
    if (m.quality.paidPlatformsActive < 2) return out
    if (!m.quality.hasObservedChannel) return out
    if (m.doubleCountGapPct === null) return out

    const gap = m.doubleCountGapPct
    if (gap < 20) return out                  // gap too small to act on

    let severity: HypothesisProposal['severity']
    if (gap > 100) severity = 'critical'
    else if (gap > 50) severity = 'high'
    else severity = 'medium'

    const observed = m.revenueObservedIls ?? 0
    const claimed = m.revenueClaimedIls

    // The platform with the lowest trust score is the most-likely over-claimer.
    const weakest = t.trust.weakestPlatform
    const trustComposite = t.trust.compositeScore
    const breakdown = m.platformBreakdown
    const topClaimer = [...breakdown].sort((a, b) => b.roasClaimed - a.roasClaimed)[0]

    const windowStart = new Date(Date.now() - m.windowDays * 86400 * 1000).toISOString()
    const windowEnd = new Date().toISOString()

    const reasoningHe =
        'הפלטפורמות מדווחות על הכנסה שמיוחסת לקליקים שלהן, אבל GA4/השרת רואים פחות. ' +
        'ההפרש משקף כפילות בייחוס: שתי פלטפורמות מקבלות קרדיט על אותה רכישה תחת חלונות ייחוס שונים. ' +
        'הפלטפורמה הסבירה ביותר להגזים היא ' + (weakest || 'הפחות אמינה') +
        ' בגלל רמת אמון נתונים נמוכה (' + trustComposite.toFixed(2) + ' מתוך 1.0).'

    const reasoning =
        'Platforms report revenue attributed to their clicks; observed (GA4/server) sees less. The gap reflects ' +
        'attribution double-counting: two platforms claim the same purchase under their own attribution windows. ' +
        'Most likely over-claimer: ' + (weakest || 'the lowest-trust platform') +
        ' (composite trust score: ' + trustComposite.toFixed(2) + ' / 1.0).'

    out.push({
        hypothesisCode: 'cross_platform_truth_double_count_gap',
        title: `Cross-platform attribution gap: ${gap.toFixed(0)}% over-claim`,
        titleHe: `פער ייחוס בין פלטפורמות: ${gap.toFixed(0)}% הצהרת יתר`,
        scopePlatform: null as any,
        scopeWindow: { start: windowStart, end: windowEnd },
        observation:
            `Paid platforms claim ₪${claimed.toFixed(0)} in revenue over ${m.windowDays} days; ` +
            `observed channel (${m.quality.observedChannel}) reports ₪${observed.toFixed(0)}. ` +
            `Claimed/observed gap: +${gap.toFixed(0)}%.`,
        observationHe:
            `הפלטפורמות מדווחות על הכנסה של ₪${claimed.toFixed(0)} ב-${m.windowDays} הימים האחרונים, ` +
            `בעוד ${m.quality.observedChannel} מדווח על ₪${observed.toFixed(0)}. ` +
            `פער: +${gap.toFixed(0)}%.`,
        hypothesis:
            'Reducing spend on the lowest-trust platform by 20-30% will shrink the gap proportionally without ' +
            'a corresponding revenue drop — confirming the over-claimed conversions were not incremental.',
        hypothesisHe:
            'הקטנת תקציב ב-20-30% בפלטפורמה עם רמת האמון הנמוכה תצמצם את הפער באופן יחסי, ' +
            'בלי ירידה משמעותית בהכנסה — מה שיוכיח שהקונברסיות שדווחו "נוספות" לא היו באמת תוספתיות.',
        reasoning,
        reasoningHe,
        severity,
        confidence: 0.75,
        expectedImpactKind: 'spend_reduction',
        expectedImpactWindowDays: 28,
        evidenceSnapshot: {
            asOf: new Date().toISOString(),
            window: { start: windowStart, end: windowEnd },
            metrics: {
                spendTotalIls: m.spendTotalIls,
                revenueClaimedIls: claimed,
                revenueObservedIls: observed,
                doubleCountGapPct: gap,
                paidPlatformsActive: m.quality.paidPlatformsActive,
                observedChannel: m.quality.observedChannel,
                trustCompositeScore: trustComposite,
                weakestPlatform: weakest,
                topClaimerPlatform: topClaimer?.platform || null,
                topClaimerRoas: topClaimer?.roasClaimed || null,
            },
        },
        proposedAction: `Reduce ${weakest} spend by 20% for 28 days; monitor observed revenue vs claimed.`,
        proposedActionHe:
            `הקטינו תקציב של ${weakest} ב-20% למשך 28 ימים ועקבו אחרי ההפרש בין הכנסה מדווחת לנצפית. ` +
            'אם ההכנסה הנצפית לא ירדה — חלק מהקונברסיות שדווחו לא היו תוספתיות.',
        manualInstructions: [
            {
                step: 1,
                platformLabel: weakest === 'meta' ? 'Meta Ads Manager' : 'Google Ads',
                actionLabel: `Reduce daily budget on top spending campaigns by 20%`,
                actionLabelHe: 'הקטינו תקציב יומי של הקמפיינים המובילים ב-20%',
                verifyHe: 'התקציב היומי החדש מופיע בעמודת Daily Budget.',
            },
            {
                step: 2,
                platformLabel: 'GA4 + Platform Reports',
                actionLabel: 'Monitor revenue gap weekly for 4 weeks',
                actionLabelHe: 'עקבו אחר הפער (מדווח מול נצפה) על בסיס שבועי במשך 4 שבועות',
                verifyHe: 'הפער מתחיל להצטמצם תוך 2-3 שבועות אם החשד נכון.',
            },
        ],
        testMethod: 'before_after_window',
        testWindowDays: 28,
        testSuccessCriteria: {
            metric: 'spend_ils',
            direction: 'decrease',
            thresholdPct: 15,
            minConv: 20,
        },
        source: 'rule_engine',
    })
    return out
}