/**
 * Phase 4.5 generator — creative volume audit.
 *
 * Per-adset creative-count audit. Meta's delivery system needs at least 4-6
 * active ads per adset to do meaningful Dynamic Creative Optimization (DCO)
 * exploration; below 4 it suppresses spend in the learning phase because
 * "exploring vs exploiting" tradeoff degrades. Google's equivalent is RSAs
 * with too few asset variants — same delivery suppression mechanic.
 *
 * Signal: COUNT(DISTINCT ad_id) per adset, last 30 days, only adsets with spend.
 * Threshold: < 4 ads → flag. < 2 → critical.
 *
 * Israeli SMB pattern: agencies hand off 1-2 hero creatives and never refresh,
 * causing predictable spend-suppression by week 3. This generator catches the
 * pattern before the user notices the spend drop.
 */

import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/db'
import { ingestedDataPoints } from '@/db/schema'
import type { GeneratorContext, HypothesisProposal } from '../types'

const MIN_CREATIVES_TARGET = 4
const MIN_CREATIVES_CRITICAL = 2
const MIN_ADSET_SPEND = 200          // ₪ floor: only flag adsets that actually have material spend

interface AdsetCreativeRow {
    platform: string
    adsetName: string
    distinctAds: number
    spendIls: number
}

export async function generateCreativeVolumeAudit(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []
    const since = new Date(ctx.now.getTime() - 30 * 86400 * 1000)
    const windowStart = since.toISOString()
    const windowEnd = ctx.now.toISOString()

    // Per-adset distinct-ad count from ingested rows with dataType='ad'.
    // `dimensions->>'adset_name'` is how Meta/Google CSV mappers stash the
    // adset/adgroup association; `dimensions->>'ad_name'` is the ad ID proxy.
    let rows: AdsetCreativeRow[] = []
    try {
        const raw = await db
            .select({
                platform: ingestedDataPoints.platform,
                adsetName: sql<string>`(${ingestedDataPoints.dimensions} ->> 'adset_name')`,
                distinctAds: sql<number>`COUNT(DISTINCT (${ingestedDataPoints.dimensions} ->> 'ad_name'))`,
                spendIls: sql<number>`COALESCE(SUM(${ingestedDataPoints.spendIls}), 0)`,
            })
            .from(ingestedDataPoints)
            .where(and(
                eq(ingestedDataPoints.instanceId, ctx.instanceId),
                eq(ingestedDataPoints.dataType, 'ad'),
                gte(ingestedDataPoints.periodEnd, since),
                sql`${ingestedDataPoints.supersededAt} IS NULL`,
                sql`${ingestedDataPoints.dimensions} ->> 'adset_name' IS NOT NULL`,
            ))
            .groupBy(ingestedDataPoints.platform, sql`(${ingestedDataPoints.dimensions} ->> 'adset_name')`)
        rows = raw.map(r => ({
            platform: String(r.platform),
            adsetName: String(r.adsetName),
            distinctAds: Number(r.distinctAds) || 0,
            spendIls: Number(r.spendIls) || 0,
        }))
    } catch (err) {
        console.warn('[creativeVolumeAudit] query failed:', err)
        return out
    }

    const underProvisionedAdsets = rows.filter(r =>
        r.distinctAds < MIN_CREATIVES_TARGET && r.spendIls >= MIN_ADSET_SPEND,
    )
    if (underProvisionedAdsets.length === 0) return out

    // Aggregate the finding at platform level — a single hypothesis per
    // platform listing the offending adsets, vs N spammy per-adset cards.
    const byPlatform = new Map<string, AdsetCreativeRow[]>()
    for (const r of underProvisionedAdsets) {
        if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, [])
        byPlatform.get(r.platform)!.push(r)
    }

    for (const [platform, adsetRows] of byPlatform) {
        const adsetCount = adsetRows.length
        const totalSpend = adsetRows.reduce((s, r) => s + r.spendIls, 0)
        const minCount = Math.min(...adsetRows.map(r => r.distinctAds))
        const severity = minCount < MIN_CREATIVES_CRITICAL ? 'critical' : 'high'
        const platformLabel = platform === 'meta' ? 'Meta' : platform === 'google_ads' ? 'Google Ads' : platform

        const adsetSummary = adsetRows
            .sort((a, b) => b.spendIls - a.spendIls)
            .slice(0, 5)
            .map(r => `${r.adsetName} (${r.distinctAds} ${platform === 'meta' ? 'ads' : 'assets'}, ₪${Math.round(r.spendIls)})`)
            .join('; ')

        out.push({
            hypothesisCode: 'creative_volume_under_minimum',
            title: `${platformLabel}: ${adsetCount} ${platform === 'meta' ? 'adset(s)' : 'ad group(s)'} running fewer than ${MIN_CREATIVES_TARGET} creatives`,
            titleHe: `${platformLabel}: ${adsetCount} ${platform === 'meta' ? 'מערכי מודעות' : 'קבוצות מודעות'} עם פחות מ-${MIN_CREATIVES_TARGET} יצירות`,
            scopePlatform: platform,
            scopeDataType: 'adset',
            scopeWindow: { start: windowStart, end: windowEnd },
            observation:
                `${adsetCount} ${platform === 'meta' ? 'adsets' : 'ad groups'} on ${platformLabel} have fewer than ${MIN_CREATIVES_TARGET} active creatives, ` +
                `accounting for ₪${Math.round(totalSpend)} of spend over the last 30 days. Top offenders: ${adsetSummary}.`,
            observationHe:
                `${adsetCount} ${platform === 'meta' ? 'מערכי מודעות' : 'קבוצות מודעות'} ב-${platformLabel} פעילים עם פחות מ-${MIN_CREATIVES_TARGET} יצירות, ` +
                `סך הוצאה ₪${Math.round(totalSpend)} ב-30 ימים. דוגמאות: ${adsetSummary}.`,
            hypothesis:
                `Adding 3-5 fresh creative variants per under-provisioned adset will reduce creative fatigue and lift delivery — ` +
                `the algorithm needs candidates to explore, and below 4 it suppresses spend in favor of conservative serving.`,
            hypothesisHe:
                `הוספת 3-5 גרסאות יצירה חדשות בכל מערך מודעות מתחת לסף תקטין עייפות יצירתית ותשפר משלוח — ` +
                `האלגוריתם צריך גרסאות לחקור, ומתחת ל-4 הוא מצמצם הוצאה לטובת משלוח שמרני.`,
            reasoning:
                `${platformLabel}'s delivery model balances exploration vs. exploitation. Below ~4 candidates per adset, exploration ` +
                `becomes unreliable and the algorithm reverts to serving the safest creative — which usually means lower volume + lower CTR.`,
            reasoningHe:
                `מודל המשלוח של ${platformLabel} מאזן בין חקירה לניצול. מתחת ל-~4 מועמדים במערך מודעות, החקירה נעשית לא אמינה ` +
                `והאלגוריתם חוזר למשלוח של היצירה הבטוחה ביותר — מה שלרוב משמעו תפוצה ו-CTR נמוכים יותר.`,
            severity,
            confidence: 0.85,
            expectedImpactKind: 'conv_uplift',
            expectedImpactWindowDays: 21,
            evidenceSnapshot: {
                asOf: ctx.now.toISOString(),
                window: { start: windowStart, end: windowEnd },
                metrics: {
                    platform,
                    adsetCount,
                    minCreativeCount: minCount,
                    totalSpendIls: totalSpend,
                    threshold: MIN_CREATIVES_TARGET,
                    adsetsDetailJson: JSON.stringify(adsetRows.map(r => ({
                        name: r.adsetName,
                        creativeCount: r.distinctAds,
                        spendIls: r.spendIls,
                    }))),
                },
            },
            proposedAction:
                `Produce 3-5 fresh creative variants per under-provisioned adset (vary hook, format, audience hint). Target: ${MIN_CREATIVES_TARGET}+ active per adset.`,
            proposedActionHe:
                `הפיקו 3-5 גרסאות יצירה חדשות בכל מערך מודעות מתחת לסף (גוונו hook, פורמט ורמז קהל). יעד: ${MIN_CREATIVES_TARGET}+ פעילות בכל מערך.`,
            manualInstructions: [
                {
                    step: 1,
                    platformLabel: platform === 'meta' ? 'Meta Ads Manager' : 'Google Ads',
                    actionLabel: `Open each adset and verify active creative count`,
                    actionLabelHe: `פתחו כל מערך מודעות ובדקו כמות יצירות פעילות`,
                    verifyHe: 'מספר המודעות הפעילות מוצג בעמודת Active Ads.',
                },
                {
                    step: 2,
                    platformLabel: 'Creative team / agent',
                    actionLabel: 'Generate 3-5 new creative variants (vary visual + copy hook)',
                    actionLabelHe: 'הפיקו 3-5 גרסאות חדשות (גוונו ויזואל + hook קופי)',
                    verifyHe: 'יש לפחות 4-6 יצירות פעילות בכל מערך לאחר ההעלאה.',
                },
                {
                    step: 3,
                    platformLabel: platform === 'meta' ? 'Meta Ads Manager' : 'Google Ads',
                    actionLabel: 'Launch the new creatives WITHOUT pausing existing ones — let the algorithm A/B test',
                    actionLabelHe: 'השיקו את היצירות החדשות בלי להשעות את הקיימות — תנו לאלגוריתם לבצע A/B',
                    verifyHe: 'תוך 7-10 ימים תראו רוטציה במשלוח לעבר הזוכים החדשים.',
                },
            ],
            testMethod: 'before_after_window',
            testWindowDays: 21,
            testSuccessCriteria: {
                metric: 'cvr',
                direction: 'increase',
                thresholdPct: 10,
                minConv: 20,
            },
            source: 'rule_engine',
        })
    }

    return out
}