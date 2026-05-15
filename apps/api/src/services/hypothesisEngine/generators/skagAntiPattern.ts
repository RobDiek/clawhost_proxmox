/**
 * Phase 4.5 generator — Single-Keyword Ad Group (SKAG) anti-pattern detector.
 *
 * SKAGs were a 2018 PPC orthodoxy: one ad group per keyword for maximum
 * relevance + Quality Score control. Smart Bidding broke this — the algo
 * needs traffic concentration to learn, and SKAGs starve each group of the
 * 15+ conversions needed for tCPA/Max Conv to converge. By 2024 Google's
 * own bidding guides recommend the opposite: STAGs (Single-Theme Ad Groups)
 * with 10-30 thematically-related keywords per group.
 *
 * Signal: COUNT(DISTINCT keyword) per ad group, last 30 days. Threshold:
 *   - >= 50% of ad groups have exactly 1 keyword AND account uses Smart
 *     Bidding (proxied by conv30d >= 15) → flag the structural anti-pattern.
 *
 * The hypothesis isn't "merge SKAGs blindly" — that destroys the existing
 * QS history. It's "transition to STAG structure on NEW campaigns and
 * gradually phase out SKAGs starting with the lowest-conv ones."
 */

import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/db'
import { ingestedDataPoints } from '@/db/schema'
import type { GeneratorContext, HypothesisProposal } from '../types'

const SKAG_DETECTION_THRESHOLD_PCT = 50      // >50% of ad groups are 1-keyword = SKAG pattern
const MIN_AD_GROUPS_TO_JUDGE = 5              // need enough groups to make the call

interface AdgroupKeywordCount {
    platform: string
    adgroupName: string
    distinctKeywords: number
    spendIls: number
    conversions: number
}

export async function generateSkagAntiPattern(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []
    const since = new Date(ctx.now.getTime() - 30 * 86400 * 1000)
    const windowStart = since.toISOString()
    const windowEnd = ctx.now.toISOString()

    let rows: AdgroupKeywordCount[] = []
    try {
        const raw = await db
            .select({
                platform: ingestedDataPoints.platform,
                adgroupName: sql<string>`COALESCE((${ingestedDataPoints.dimensions} ->> 'adgroup_name'), (${ingestedDataPoints.dimensions} ->> 'ad_group_name'))`,
                distinctKeywords: sql<number>`COUNT(DISTINCT (${ingestedDataPoints.dimensions} ->> 'keyword'))`,
                spendIls: sql<number>`COALESCE(SUM(${ingestedDataPoints.spendIls}), 0)`,
                conversions: sql<number>`COALESCE(SUM(${ingestedDataPoints.conversions}), 0)`,
            })
            .from(ingestedDataPoints)
            .where(and(
                eq(ingestedDataPoints.instanceId, ctx.instanceId),
                eq(ingestedDataPoints.dataType, 'keyword'),
                eq(ingestedDataPoints.platform, 'google_ads'),
                gte(ingestedDataPoints.periodEnd, since),
                sql`${ingestedDataPoints.supersededAt} IS NULL`,
                sql`COALESCE((${ingestedDataPoints.dimensions} ->> 'adgroup_name'), (${ingestedDataPoints.dimensions} ->> 'ad_group_name')) IS NOT NULL`,
            ))
            .groupBy(
                ingestedDataPoints.platform,
                sql`COALESCE((${ingestedDataPoints.dimensions} ->> 'adgroup_name'), (${ingestedDataPoints.dimensions} ->> 'ad_group_name'))`,
            )
        rows = raw.map(r => ({
            platform: String(r.platform),
            adgroupName: String(r.adgroupName),
            distinctKeywords: Number(r.distinctKeywords) || 0,
            spendIls: Number(r.spendIls) || 0,
            conversions: Number(r.conversions) || 0,
        }))
    } catch (err) {
        console.warn('[skagAntiPattern] query failed:', err)
        return out
    }

    if (rows.length < MIN_AD_GROUPS_TO_JUDGE) return out

    const skagGroups = rows.filter(r => r.distinctKeywords === 1)
    const skagSharePct = (skagGroups.length / rows.length) * 100
    if (skagSharePct < SKAG_DETECTION_THRESHOLD_PCT) return out

    // Only meaningful when Smart Bidding is plausibly running (>15 conv/30d signal floor).
    const totalConv = rows.reduce((s, r) => s + r.conversions, 0)
    if (totalConv < 15) return out

    const totalSpend = rows.reduce((s, r) => s + r.spendIls, 0)
    const severity = skagSharePct >= 80 ? 'high' : 'medium'

    out.push({
        hypothesisCode: 'structure_skag_anti_pattern',
        title: `Google Ads: SKAG structure on ${skagGroups.length} of ${rows.length} ad groups (${skagSharePct.toFixed(0)}%)`,
        titleHe: `Google Ads: מבנה SKAG ב-${skagGroups.length} מתוך ${rows.length} קבוצות מודעות (${skagSharePct.toFixed(0)}%)`,
        scopePlatform: 'google_ads',
        scopeDataType: 'account',
        scopeWindow: { start: windowStart, end: windowEnd },
        observation:
            `${skagSharePct.toFixed(0)}% of active ad groups contain exactly 1 keyword (SKAG structure). ` +
            `Total active account spend over 30 days: ₪${Math.round(totalSpend)} across ${totalConv} conversions. ` +
            `Smart Bidding cannot stabilize per-ad-group when each group has <15 conversions; SKAGs fragment the signal.`,
        observationHe:
            `${skagSharePct.toFixed(0)}% מקבוצות המודעות הפעילות מכילות בדיוק מילת מפתח אחת (מבנה SKAG). ` +
            `סך הוצאה ב-30 ימים: ₪${Math.round(totalSpend)} עם ${totalConv} המרות. ` +
            `Smart Bidding לא יכול להתייצב ברמת קבוצת מודעות כשבכל קבוצה פחות מ-15 המרות; SKAGs מפצלים את הסיגנל.`,
        hypothesis:
            `Consolidating SKAGs into STAGs (Single-Theme Ad Groups, 10-30 thematically related keywords) ` +
            `will give Smart Bidding the conversion concentration it needs to optimize, improving CPA by 10-25% within 4 weeks.`,
        hypothesisHe:
            `איחוד SKAGs ל-STAGs (Single-Theme Ad Groups עם 10-30 מילים תמטיות) ` +
            `יעניק ל-Smart Bidding את ריכוז ההמרות שהוא צריך לאופטימיזציה — שיפור CPA של 10-25% תוך 4 שבועות.`,
        reasoning:
            `Google's own 2024 bidding guide recommends thematic grouping. The 2018 SKAG orthodoxy (one keyword per group ` +
            `for QS control) was rendered obsolete by Smart Bidding — the algorithm now reweights signal across the ad group ` +
            `and benefits from theme-level traffic concentration. SKAGs starve each group below the 15-conv/30d threshold.`,
        reasoningHe:
            `המדריך הרשמי של Google ל-2024 ממליץ על קיבוץ תמטי. האורתודוקסיה של SKAG מ-2018 (מילה אחת בקבוצה לשליטת QS) ` +
            `התיישנה עם Smart Bidding — האלגוריתם משקלל מחדש את הסיגנל ברמת הקבוצה ומרוויח מריכוז תנועה תמטי. ` +
            `SKAGs מרעיבים כל קבוצה מתחת לסף 15 המרות ב-30 ימים.`,
        severity,
        confidence: 0.75,
        expectedImpactKind: 'cpa_reduction',
        expectedImpactWindowDays: 28,
        evidenceSnapshot: {
            asOf: ctx.now.toISOString(),
            window: { start: windowStart, end: windowEnd },
            metrics: {
                platform: 'google_ads',
                totalAdGroups: rows.length,
                skagCount: skagGroups.length,
                skagSharePct,
                totalSpendIls: totalSpend,
                totalConversions: totalConv,
                threshold: SKAG_DETECTION_THRESHOLD_PCT,
            },
        },
        proposedAction:
            `Don't merge existing SKAGs blindly (you'll lose QS history). Instead: (1) freeze new SKAGs going forward; ` +
            `(2) build new STAGs (10-30 thematic keywords) for new themes; (3) phase out lowest-volume SKAGs over 4 weeks ` +
            `by pausing and rebuilding within an existing STAG.`,
        proposedActionHe:
            `אל תאחדו SKAGs קיימים באופן עיוור (תאבדו היסטוריית QS). במקום: (1) הקפיאו פתיחת SKAGs חדשים; ` +
            `(2) בנו STAGs חדשים (10-30 מילים תמטיות) עבור תמות חדשות; (3) פיזרו SKAGs בעלי נפח נמוך לאורך 4 שבועות ` +
            `על-ידי השעיה ובנייה מחדש ב-STAG קיים.`,
        manualInstructions: [
            {
                step: 1,
                platformLabel: 'Google Ads',
                actionLabel: 'Export the ad groups list to spreadsheet, sort by 30d conversions ascending',
                actionLabelHe: 'ייצאו את רשימת קבוצות המודעות לגיליון, מיינו לפי המרות 30 ימים בסדר עולה',
                verifyHe: 'הגיליון מכיל את כל קבוצות המודעות עם עמודות keyword count, spend, conversions.',
            },
            {
                step: 2,
                platformLabel: 'Strategy',
                actionLabel: 'Identify thematic clusters: group keywords by intent ("buy red shoes", "red shoes price", "red shoes sale" → one STAG)',
                actionLabelHe: 'זהו קלסטרים תמטיים: קבצו מילים לפי כוונה ("קניית נעליים אדומות", "מחיר נעליים אדומות" → STAG אחד)',
            },
            {
                step: 3,
                platformLabel: 'Google Ads',
                actionLabel: 'Build 2-3 new STAGs as pilot with the highest-volume themes; populate with 10-20 keywords each',
                actionLabelHe: 'בנו 2-3 STAGs חדשים כפיילוט עם התמות בנפח הגבוה ביותר; מלאו ב-10-20 מילים בכל אחד',
                verifyHe: 'בכל STAG חדש נראה 10+ מילים פעילות לאחר שמירה.',
            },
            {
                step: 4,
                platformLabel: 'Google Ads',
                actionLabel: 'Pause the lowest-volume SKAGs (bottom quartile by conv30d); wait 14 days; measure if STAGs absorb the traffic',
                actionLabelHe: 'השהו את ה-SKAGs בעלי הנפח הנמוך ביותר (רבעון תחתון לפי המרות 30 ימים); המתינו 14 ימים; בדקו אם STAGs קולטים את התנועה',
                verifyHe: 'הקלקים והמרות של ה-SKAGs המושהים אמורים להופיע ב-STAGs החדשים.',
            },
        ],
        testMethod: 'before_after_window',
        testWindowDays: 28,
        testSuccessCriteria: {
            metric: 'cpa_ils',
            direction: 'decrease',
            thresholdPct: 10,
            minConv: 30,
        },
        source: 'rule_engine',
    })

    return out
}