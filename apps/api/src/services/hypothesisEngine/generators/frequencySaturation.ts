/**
 * Frequency saturation generator (Meta-specific).
 *
 * Theory:
 *   Meta auction surfaces same users to a campaign repeatedly. Beyond ~3-4
 *   impressions per user per week, response rate flattens and CPM creeps up
 *   (auction signals "low quality" to inventory). The empirical curve from
 *   Adalysis 2024-2026 audits: freq > 4 → ROAS decline begins; freq > 6 →
 *   ROAS declines 20-40% vs same audience at freq 1-2.
 *
 * Detection: campaign with avg_frequency > 4 AND (ROAS dropping OR
 * conv/impressions ratio decaying — proxied with no time-series; just flag
 * the freq > 4 cases as candidates for the user to investigate).
 *
 * Action: rotate creative OR expand audience OR exclude high-frequency
 * users (Meta has "Exclude users who saw ad N+ times" — Phase 2 capability).
 */

import type { GeneratorContext, HypothesisProposal } from '../types'
import { frequencyByCampaign30d } from '../evidence'

export async function generateFrequencySaturation(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []
    const stats = await frequencyByCampaign30d(ctx.instanceId)
    if (stats.length === 0) return out

    const windowStart = new Date(ctx.now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const windowEnd = ctx.now.toISOString().slice(0, 10)

    for (const c of stats) {
        if (c.avgFrequency < 4) continue
        if (c.spendIls < 300) continue   // too small to be worth flagging

        const freqLabel = c.avgFrequency.toFixed(1)
        // Severity scales with frequency
        const severity: 'medium' | 'high' | 'critical' =
            c.avgFrequency >= 8 ? 'critical'
                : c.avgFrequency >= 6 ? 'high'
                    : 'medium'

        out.push({
            hypothesisCode: 'frequency_saturation_meta',
            title: `Meta: "${c.entityName}" avg frequency ${freqLabel} — audience fatigue likely`,
            titleHe: `Meta: "${c.entityName}" תדירות ממוצעת ${freqLabel} — סביר שיש שחיקת קהל`,
            scopePlatform: 'meta',
            scopeDataType: 'campaign',
            scopeEntityId: c.entityId,
            scopeEntityName: c.entityName,
            scopeWindow: { start: windowStart, end: windowEnd },

            observation: `Campaign "${c.entityName}" averaging ${freqLabel} impressions per unique user in last 30 days. Spend: ₪${c.spendIls.toFixed(0)}. ${c.roas !== null ? `ROAS: ${c.roas.toFixed(2)}.` : ''} Reach: ${c.avgReach.toFixed(0)}.`,
            observationHe: `הקמפיין "${c.entityName}" מציג בממוצע ${freqLabel} חשיפות לכל משתמש ייחודי ב-30 הימים האחרונים. הוצאה: ₪${c.spendIls.toFixed(0)}. ${c.roas !== null ? `ROAS: ${c.roas.toFixed(2)}.` : ''} Reach: ${c.avgReach.toFixed(0)}.`,
            hypothesis: `Audience is saturated. Three options: (a) rotate creative — fresh ads reset perceived frequency, (b) expand audience — add lookalike layers or interest expansion, (c) cap frequency — Meta lets you exclude users who've seen the ad 5+ times. Expected outcome: -15-30% CPM, +10-25% CVR.`,
            hypothesisHe: `הקהל מורווה. שלוש אפשרויות: (א) רוטציית קריאייטיב — מודעות חדשות מאפסות את התדירות הנתפסת, (ב) הרחבת קהל — הוסיפו שכבות lookalike או הרחבת תחומי עניין, (ג) הגבלת תדירות — Meta מאפשר להחריג משתמשים שראו את המודעה 5+ פעמים. תוצאה צפויה: -15-30% CPM, +10-25% CVR.`,
            reasoning: `Adalysis 2024-2026 audit data: at freq 4-6, ROAS drops 10-20% vs freq 1-2 baseline; at freq 6+, drop is 20-40%. Mechanism: ad-blindness + Meta's quality ranking score downgrades the ad in subsequent auctions, raising CPM. Three actions are roughly equivalent in CPA impact; creative rotation is cheapest if you have stocked ads.`,
            reasoningHe: `נתוני audit של Adalysis 2024-2026: בתדירות 4-6, ROAS יורד ב-10-20% לעומת בסיס תדירות 1-2; בתדירות 6+, הירידה היא 20-40%. המנגנון: ad-blindness + ציון quality ranking של Meta מוריד את המודעה במכרזים הבאים, מעלה CPM. שלוש הפעולות שוות בערך בהשפעה על CPA; רוטציית קריאייטיב הזולה ביותר אם יש לכם מלאי מודעות.`,

            severity,
            confidence: 0.7,
            expectedImpactKind: 'cpa_reduction',
            expectedImpactWindowDays: 30,

            evidenceSnapshot: {
                asOf: ctx.now.toISOString(),
                metrics: {
                    avgFrequency: c.avgFrequency,
                    avgReach: c.avgReach,
                    spendIls: c.spendIls,
                    conversions: c.conversions,
                    roas: c.roas,
                    severity,
                },
                window: { start: windowStart, end: windowEnd },
            },

            proposedAction: `Rotate creative (3-5 new ads at minimum); or expand audience by adding lookalike 1-5%; or cap impression frequency at 5/week.`,
            proposedActionHe: `רוטציית קריאייטיב (3-5 מודעות חדשות לפחות); או הרחבת קהל בהוספת lookalike 1-5%; או הגבלת תדירות חשיפה ל-5 לשבוע.`,
            manualInstructions: [
                {
                    step: 1,
                    platformLabel: 'Meta Ads Manager',
                    actionLabel: 'Open campaign → Ad sets → Ads. Check creative age: ads running >21 days are due for rotation.',
                    actionLabelHe: 'פתחו את הקמפיין → ערכות מודעות → מודעות. בדקו גיל קריאייטיב: מודעות הרצות 21+ יום בשלות לרוטציה.',
                },
                {
                    step: 2,
                    platformLabel: 'Meta Ads Manager',
                    actionLabel: 'Add 3-5 new ads to the ad set. Keep variation: different hook, different image/video, different angle.',
                    actionLabelHe: 'הוסיפו 3-5 מודעות חדשות לערכת המודעות. שמרו על שונות: hook אחר, תמונה/וידאו אחר, אנגל אחר.',
                    verify: 'New ads should be in "Active" status alongside the old ones.',
                    verifyHe: 'מודעות חדשות צריכות להיות בסטטוס "Active" לצד הישנות.',
                },
                {
                    step: 3,
                    platformLabel: 'Meta Ads Manager',
                    actionLabel: 'Wait 7 days. Check the new ads\' frequency — should be <2. If so, pause the old ads to let new ones dominate.',
                    actionLabelHe: 'המתינו 7 ימים. בדקו את התדירות של המודעות החדשות — צריכה להיות <2. אם כן, השהו את הישנות שהחדשות ישלטו.',
                },
            ],

            testMethod: 'before_after_window',
            testWindowDays: 14,
            testSuccessCriteria: {
                metric: 'cpa_ils',
                direction: 'decrease',
                thresholdPct: 10,
                minConv: 10,
                minSpendIls: 300,
            },

            source: 'rule_engine',
        })
    }

    return out
}