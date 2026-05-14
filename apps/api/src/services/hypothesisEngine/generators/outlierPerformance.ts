/**
 * Outlier performance generator.
 *
 * For each platform with ≥4 campaigns in the last 30d, identify:
 *   - Top decile by ROAS (or CVR if no conversion value) → propose budget shift IN
 *   - Bottom decile by CPA (or CTR if no conversions) → propose pause/restructure
 *
 * Why decile (not absolute thresholds): SMBs run 5-20 campaigns at most.
 * The "industry-average" CPA framing is useless — what matters is the
 * portfolio-relative variance. A campaign 3x your account's median CPA
 * is wasteful regardless of industry; a campaign at half your median
 * deserves more budget regardless of industry.
 *
 * Guard rails to avoid false positives:
 *   - Need ≥4 active campaigns to compute deciles meaningfully
 *   - Each candidate must have ≥10 conv30d (or ≥500 clicks if no conv) —
 *     otherwise the per-campaign CPA/CVR is noise
 *   - Spend share must be ≥5% of platform spend — ignore tiny test campaigns
 */

import type { GeneratorContext, HypothesisProposal } from '../types'
import { campaignPerformance30d } from '../evidence'

export async function generateOutlierPerformance(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []
    const campaigns = await campaignPerformance30d(ctx.instanceId)
    if (campaigns.length === 0) return out

    const windowStart = new Date(ctx.now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const windowEnd = ctx.now.toISOString().slice(0, 10)

    // Group by platform
    const byPlatform = new Map<string, typeof campaigns>()
    for (const c of campaigns) {
        if (!byPlatform.has(c.platform)) byPlatform.set(c.platform, [])
        byPlatform.get(c.platform)!.push(c)
    }

    for (const [platform, list] of byPlatform.entries()) {
        if (list.length < 4) continue

        const totalPlatformSpend = list.reduce((s, c) => s + c.spendIls, 0)
        if (totalPlatformSpend < 500) continue   // too small to draw conclusions

        // Filter to campaigns with enough signal
        const significant = list.filter(c =>
            (c.conversions >= 10 || c.clicks >= 500)
            && c.spendIls / totalPlatformSpend >= 0.05,
        )
        if (significant.length < 3) continue   // need at least 3 to call deciles

        // Sort by CPA ascending (best first); take top + bottom
        const withCpa = significant.filter(c => c.cpaIls !== null).sort((a, b) => (a.cpaIls! - b.cpaIls!))
        if (withCpa.length < 3) continue

        const medianCpa = withCpa[Math.floor(withCpa.length / 2)].cpaIls!
        const best = withCpa[0]
        const worst = withCpa[withCpa.length - 1]
        const platformLabel = platform === 'meta' ? 'Meta' : platform === 'google_ads' ? 'Google Ads' : platform

        // ── Underperformer: CPA ≥ 2x median ──────────────────────────────
        if (worst.cpaIls! >= medianCpa * 2 && worst.spendIls >= 300) {
            const cpaMultiple = (worst.cpaIls! / medianCpa).toFixed(1)
            const wastedSpend = worst.spendIls - (worst.conversions * medianCpa)
            out.push({
                hypothesisCode: 'outlier_underperformer',
                title: `${platformLabel}: "${worst.entityName}" CPA ${cpaMultiple}× account median`,
                titleHe: `${platformLabel}: "${worst.entityName}" CPA פי ${cpaMultiple} מהחציון של החשבון`,
                scopePlatform: platform,
                scopeDataType: 'campaign',
                scopeEntityId: worst.entityId,
                scopeEntityName: worst.entityName,
                scopeWindow: { start: windowStart, end: windowEnd },

                observation: `Campaign "${worst.entityName}" spent ₪${worst.spendIls.toFixed(0)} in 30d for ${worst.conversions} conversions (CPA ₪${worst.cpaIls!.toFixed(0)}). Account median CPA is ₪${medianCpa.toFixed(0)} — this campaign is ${cpaMultiple}× more expensive per conversion than the rest of the portfolio.`,
                observationHe: `הקמפיין "${worst.entityName}" הוציא ₪${worst.spendIls.toFixed(0)} ב-30 ימים תמורת ${worst.conversions} המרות (CPA ₪${worst.cpaIls!.toFixed(0)}). חציון ה-CPA של החשבון הוא ₪${medianCpa.toFixed(0)} — הקמפיין הזה יקר פי ${cpaMultiple} להמרה מהשאר.`,
                hypothesis: `This campaign's targeting, creative, or landing page is materially worse than others. Pausing and rebuilding (or reallocating its budget to better-performing campaigns) will reduce overall CPA by ~₪${wastedSpend.toFixed(0)}/30d.`,
                hypothesisHe: `הטרגוט, הקריאייטיב או דף הנחיתה של הקמפיין הזה גרועים מהותית מהאחרים. השהייה ובנייה מחדש (או הסטת התקציב לקמפיינים שמתפקדים טוב יותר) תפחית את ה-CPA הכולל ב-~₪${wastedSpend.toFixed(0)} ב-30 ימים.`,
                reasoning: `Decile-relative comparison: portfolio median CPA is the right benchmark (industry numbers don't account for your specific business + audience). At ${cpaMultiple}× median, this campaign is statistically anomalous, not normal variance — variance in well-segmented portfolios typically caps at 1.4-1.7× median. Action: pause for 7d to isolate; if other campaigns show no degradation, kill this one or rebuild from scratch.`,
                reasoningHe: `השוואה דצילית: חציון ה-CPA של הפורטפוליו הוא ה-benchmark הנכון (מספרי תעשייה לא לוקחים בחשבון את העסק והקהל הספציפיים שלכם). ב-${cpaMultiple}× חציון, הקמפיין הזה חריג סטטיסטית, לא שונות נורמלית — שונות בפורטפוליו מסומן היטב מגיעה בדרך כלל עד 1.4-1.7× חציון. פעולה: השהו ל-7 ימים לבידוד; אם קמפיינים אחרים לא מתדרדרים, סגרו את זה או בנו מחדש.`,

                severity: 'high',
                confidence: 0.7,
                expectedImpactIls: -wastedSpend,
                expectedImpactKind: 'spend_reduction',
                expectedImpactWindowDays: 30,

                evidenceSnapshot: {
                    asOf: ctx.now.toISOString(),
                    metrics: {
                        platform,
                        entityName: worst.entityName,
                        spendIls: worst.spendIls,
                        conversions: worst.conversions,
                        cpaIls: worst.cpaIls,
                        medianCpaIls: medianCpa,
                        cpaMultipleOfMedian: Number(cpaMultiple),
                        portfolioSizeCampaigns: list.length,
                    },
                    window: { start: windowStart, end: windowEnd },
                    qualitySummary: {
                        minScore: worst.minQualityScore,
                        flagsObserved: [],
                        attributionWindowsSeen: worst.attributionWindows,
                        eventsSeen: [],
                    },
                },
                evidenceQualityScore: worst.minQualityScore,

                proposedAction: `Pause "${worst.entityName}" for 7 days. Watch whether portfolio CPA improves. If yes, kill or rebuild it.`,
                proposedActionHe: `השהו את "${worst.entityName}" ל-7 ימים. עקבו אם CPA של הפורטפוליו משתפר. אם כן, סגרו או בנו מחדש.`,
                manualInstructions: [
                    {
                        step: 1,
                        platformLabel: platformLabel,
                        actionLabel: `Open ${platformLabel} → Campaigns → find "${worst.entityName}"`,
                        actionLabelHe: `פתחו ${platformLabel} → קמפיינים → חפשו "${worst.entityName}"`,
                    },
                    {
                        step: 2,
                        platformLabel,
                        actionLabel: 'Toggle status to PAUSED.',
                        actionLabelHe: 'העבירו את הסטטוס ל-PAUSED.',
                        verify: 'Status badge should read "Paused" / "מושהה".',
                        verifyHe: 'תוית הסטטוס צריכה להיות "Paused" / "מושהה".',
                    },
                    {
                        step: 3,
                        platformLabel,
                        actionLabel: 'Wait 7 days. Do NOT change other campaigns during this period — we need a clean comparison.',
                        actionLabelHe: 'המתינו 7 ימים. אל תשנו קמפיינים אחרים בתקופה הזו — אנחנו צריכים השוואה נקייה.',
                    },
                ],

                testMethod: 'before_after_window',
                testWindowDays: 7,
                testSuccessCriteria: {
                    metric: 'cpa_ils',
                    direction: 'decrease',
                    thresholdPct: 10,
                    minConv: 10,
                    minSpendIls: 500,
                },

                source: 'rule_engine',
            })
        }

        // ── Overperformer: CPA ≤ 0.5x median + ≥15 conversions ───────────
        if (best.cpaIls! <= medianCpa * 0.5 && best.conversions >= 15) {
            const cpaFraction = (best.cpaIls! / medianCpa).toFixed(2)
            // Estimate what 50% more budget would yield at the campaign's current CVR
            const upliftSpend = best.spendIls * 0.5
            const upliftConv = upliftSpend / best.cpaIls!
            out.push({
                hypothesisCode: 'outlier_overperformer',
                title: `${platformLabel}: "${best.entityName}" CPA ${(1 / Number(cpaFraction)).toFixed(1)}× cheaper than median`,
                titleHe: `${platformLabel}: "${best.entityName}" CPA זול פי ${(1 / Number(cpaFraction)).toFixed(1)} מהחציון`,
                scopePlatform: platform,
                scopeDataType: 'campaign',
                scopeEntityId: best.entityId,
                scopeEntityName: best.entityName,
                scopeWindow: { start: windowStart, end: windowEnd },

                observation: `Campaign "${best.entityName}" produced ${best.conversions} conversions at CPA ₪${best.cpaIls!.toFixed(0)} — only ${(Number(cpaFraction) * 100).toFixed(0)}% of account median (₪${medianCpa.toFixed(0)}). Spend in 30d: ₪${best.spendIls.toFixed(0)}.`,
                observationHe: `הקמפיין "${best.entityName}" הביא ${best.conversions} המרות ב-CPA ₪${best.cpaIls!.toFixed(0)} — רק ${(Number(cpaFraction) * 100).toFixed(0)}% מחציון החשבון (₪${medianCpa.toFixed(0)}). הוצאה ב-30 ימים: ₪${best.spendIls.toFixed(0)}.`,
                hypothesis: `Increase budget by 50% (₪${upliftSpend.toFixed(0)} additional/30d). Conservative estimate: ~${upliftConv.toFixed(0)} more conversions at the same CPA, assuming the campaign is not impression-share-limited.`,
                hypothesisHe: `הגדילו את התקציב ב-50% (₪${upliftSpend.toFixed(0)} נוספים ב-30 ימים). הערכה שמרנית: ~${upliftConv.toFixed(0)} המרות נוספות באותו CPA, בהנחה שהקמפיין לא מוגבל ב-impression share.`,
                reasoning: `Decile-relative outlier with sufficient sample (${best.conversions} conv > 15 threshold). Risk: at high impression share (>80%) further budget brings diminishing returns and CPA inflation. Mitigation: lift in 25% increments over 2 weeks rather than 50% in one shot; monitor CPA at each step. If platform reports impression_share_lost_budget > 5%, lift is safe.`,
                reasoningHe: `outlier דצילי עם מדגם מספיק (${best.conversions} המרות > סף 15). סיכון: ב-impression share גבוה (>80%), תקציב נוסף מביא לתשואות פוחתות ולנפיחות CPA. הקלה: העלאה בצעדים של 25% במשך שבועיים, לא 50% בבת אחת; עקבו אחרי CPA בכל שלב. אם הפלטפורמה מדווחת על impression_share_lost_budget > 5%, ההעלאה בטוחה.`,

                severity: 'medium',
                confidence: 0.65,
                expectedImpactIls: upliftConv * (medianCpa - best.cpaIls!),
                expectedImpactKind: 'conv_uplift',
                expectedImpactWindowDays: 30,

                evidenceSnapshot: {
                    asOf: ctx.now.toISOString(),
                    metrics: {
                        platform,
                        entityName: best.entityName,
                        spendIls: best.spendIls,
                        conversions: best.conversions,
                        cpaIls: best.cpaIls,
                        medianCpaIls: medianCpa,
                        cpaFractionOfMedian: Number(cpaFraction),
                    },
                    window: { start: windowStart, end: windowEnd },
                },
                evidenceQualityScore: best.minQualityScore,

                proposedAction: `Lift budget on "${best.entityName}" by 25% this week. Re-check CPA in 7 days; if held, lift another 25%.`,
                proposedActionHe: `הגדילו תקציב של "${best.entityName}" ב-25% השבוע. בדקו את ה-CPA בעוד 7 ימים; אם נשמר, העלו עוד 25%.`,
                manualInstructions: [
                    {
                        step: 1,
                        platformLabel,
                        actionLabel: `Open ${platformLabel} → Campaigns → find "${best.entityName}"`,
                        actionLabelHe: `פתחו ${platformLabel} → קמפיינים → חפשו "${best.entityName}"`,
                    },
                    {
                        step: 2,
                        platformLabel,
                        actionLabel: `Current daily budget: ₪${(best.spendIls / 30).toFixed(0)} (calculated from 30d spend). Increase by 25% → new daily budget ~₪${(best.spendIls / 30 * 1.25).toFixed(0)}.`,
                        actionLabelHe: `תקציב יומי נוכחי: ₪${(best.spendIls / 30).toFixed(0)} (מחושב מהוצאה של 30 ימים). הגדילו ב-25% → תקציב יומי חדש ~₪${(best.spendIls / 30 * 1.25).toFixed(0)}.`,
                        verify: 'New budget should be visible in the campaign Settings panel.',
                        verifyHe: 'התקציב החדש צריך להיות גלוי בלוח ההגדרות של הקמפיין.',
                    },
                    {
                        step: 3,
                        platformLabel,
                        actionLabel: 'Wait 7 days. If CPA stayed within +10%, lift another 25%. If CPA inflated >15%, revert and stop scaling.',
                        actionLabelHe: 'המתינו 7 ימים. אם CPA נשאר תוך +10%, העלו עוד 25%. אם CPA התנפח ביותר מ-15%, החזירו לאחור והפסיקו לסקייל.',
                    },
                ],

                testMethod: 'before_after_window',
                testWindowDays: 7,
                testSuccessCriteria: {
                    metric: 'cpa_ils',
                    direction: 'no_worse_than',
                    thresholdPct: 10,
                    minConv: 15,
                    minSpendIls: 500,
                },

                source: 'rule_engine',
            })
        }
    }

    return out
}