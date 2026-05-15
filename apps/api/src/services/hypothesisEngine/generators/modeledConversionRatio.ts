/**
 * Phase 4.3.2 — Modeled-vs-observed conversion ratio generator.
 *
 * 2026 reality: post-iOS-ATT and EU Consent Mode v2, platforms FILL the
 * missing conversion data with statistical models. Google: 15-40% of
 * conversions are modeled on iOS-heavy or EU-heavy accounts. Meta AEM
 * modeled: 20-35% on iOS. Practitioner translation: "your reported 100
 * conversions might be 70 observed + 30 modeled."
 *
 * When >40% of an account's conversions are modeled, Smart Bidding is
 * effectively training on the algorithm's own guesses about the algorithm —
 * a recursive degradation that produces unpredictable bid behavior.
 *
 * Detection heuristic (we don't have direct API access to modeled flags
 * yet — Phase 4.3.2b will pull them when Meta's deepEnrich + Google Ads
 * API integrations land). For now, we use proxies:
 *
 *   Proxy 1 — "unknown" attribution metadata pct
 *     If >40% of conversion rows have attribution_window='unknown' OR
 *     conversion_event_name='all'|'unknown'|null, the data is functionally
 *     "blind" — same downstream consequences as high modeled %.
 *
 *   Proxy 2 — Generic mapper share
 *     If >30% of rows came through generic_csv mapper (not platform-
 *     specific), we're working with low-fidelity historical data and
 *     should warn user before scaling.
 *
 *   Proxy 3 — Single-day-grain absence
 *     If <30% of rows have period_date_local set (multi-day rollups
 *     dominate), the data is too coarse for daily-level optimization
 *     decisions. Smart Bidding decisions made on weekly-rollup data
 *     are 20-30% less accurate than on daily-grain data.
 *
 * Severity scales:
 *   - >70% blind → CRITICAL ("don't make decisions on this account")
 *   - 40-70% blind → HIGH ("treat recommendations as directional")
 *   - 30-40% blind → MEDIUM ("flag in client reporting")
 */

import { sql } from 'drizzle-orm'
import { db } from '@/db'
import type { GeneratorContext, HypothesisProposal } from '../types'

interface QualityProxy {
    totalConvRows: number
    rowsBlindAttribution: number
    rowsGenericMapper: number
    rowsWithoutDailyGrain: number
    blindAttributionPct: number
    genericMapperPct: number
    rolledUpPct: number
    /** Composite "modeling proxy" — weighted average of the three signals. */
    modelingProxyPct: number
    /** OAuth-sourced row share (high quality). */
    oauthRowShare: number
}

async function measureQualityProxy(instanceId: string): Promise<QualityProxy> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const result = await db.execute(sql`
        SELECT
            COUNT(*) FILTER (WHERE conversions IS NOT NULL AND conversions > 0) AS total_conv_rows,
            COUNT(*) FILTER (WHERE conversions IS NOT NULL AND conversions > 0
                              AND (attribution_window IS NULL
                                   OR attribution_window = 'unknown'
                                   OR conversion_event_name IS NULL
                                   OR conversion_event_name IN ('all', 'unknown'))) AS blind_attr,
            COUNT(*) FILTER (WHERE conversions IS NOT NULL AND conversions > 0
                              AND source_type = 'generic_csv') AS generic_mapper,
            COUNT(*) FILTER (WHERE conversions IS NOT NULL AND conversions > 0
                              AND period_date_local IS NULL) AS no_daily,
            COUNT(*) FILTER (WHERE conversions IS NOT NULL AND conversions > 0
                              AND source_mode = 'oauth') AS oauth_rows
        FROM ingested_data_points
        WHERE instance_id = ${instanceId}
          AND period_end >= ${since}::timestamptz
          AND superseded_at IS NULL
    `)
    const row = ((((result as unknown) as { rows?: any[] }).rows) || [])[0] || {}
    const total = Number(row.total_conv_rows) || 0
    const blind = Number(row.blind_attr) || 0
    const generic = Number(row.generic_mapper) || 0
    const noDaily = Number(row.no_daily) || 0
    const oauth = Number(row.oauth_rows) || 0

    const blindPct = total > 0 ? blind / total : 0
    const genericPct = total > 0 ? generic / total : 0
    const rolledUpPct = total > 0 ? noDaily / total : 0
    const oauthShare = total > 0 ? oauth / total : 0

    // Composite: weighted average of three signals (blind=50%, generic=30%, rolled-up=20%)
    const proxy = blindPct * 0.5 + genericPct * 0.3 + rolledUpPct * 0.2

    return {
        totalConvRows: total,
        rowsBlindAttribution: blind,
        rowsGenericMapper: generic,
        rowsWithoutDailyGrain: noDaily,
        blindAttributionPct: blindPct,
        genericMapperPct: genericPct,
        rolledUpPct,
        modelingProxyPct: proxy,
        oauthRowShare: oauthShare,
    }
}

export async function generateModeledConversionRatio(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []

    const q = await measureQualityProxy(ctx.instanceId)
    if (q.totalConvRows < 10) return out  // Too few rows to assess meaningfully

    const windowStart = new Date(ctx.now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const windowEnd = ctx.now.toISOString().slice(0, 10)

    // Decide severity based on composite proxy
    let severity: 'critical' | 'high' | 'medium'
    let severityNarrativeHe: string
    let actionThrustHe: string
    if (q.modelingProxyPct > 0.7) {
        severity = 'critical'
        severityNarrativeHe = 'נתוני הקונברסיות "עיוורים" ב-70%+ — ההמלצות הנוכחיות מבוססות על אלגוריתמים שמנחשים על data חסר. אסור לקבל החלטות תקציביות גדולות לפני תיקון.'
        actionThrustHe = 'עצרו scale חדש. תקנו tracking לפני המשך.'
    } else if (q.modelingProxyPct > 0.4) {
        severity = 'high'
        severityNarrativeHe = '40-70% מהנתונים עם איכות נמוכה — ההמלצות הן directional, לא נומריות. ניתן להמשיך אבל עם treat-as-hypothesis mindset.'
        actionThrustHe = 'התייחסו להמלצות כ-directional ולא absolute. תיקון tracking ישפר confidence.'
    } else if (q.modelingProxyPct > 0.3) {
        severity = 'medium'
        severityNarrativeHe = '30-40% מהנתונים עם איכות נמוכה — מומלץ לדווח על זה ב-reporting השבועי ללקוח.'
        actionThrustHe = 'הוסיפו "data quality: X% modeled" badge בדוחות שלכם.'
    } else {
        return out  // <30% — data quality is acceptable, no flag
    }

    out.push({
        hypothesisCode: 'tracking_data_quality_modeled_share',
        title: `~${Math.round(q.modelingProxyPct * 100)}% of conversion data is "modeled" or low-fidelity (proxy estimate)`,
        titleHe: `~${Math.round(q.modelingProxyPct * 100)}% מנתוני ההמרה הם "modeled" או באיכות נמוכה (proxy)`,
        scopeDataType: 'account',
        scopeWindow: { start: windowStart, end: windowEnd },

        observation: `Of ${q.totalConvRows} conversion-bearing rows in last 90 days: ${q.rowsBlindAttribution} (${(q.blindAttributionPct * 100).toFixed(0)}%) lack proper attribution metadata, ${q.rowsGenericMapper} (${(q.genericMapperPct * 100).toFixed(0)}%) came through generic CSV mapper, ${q.rowsWithoutDailyGrain} (${(q.rolledUpPct * 100).toFixed(0)}%) are multi-day rollups (no daily grain). Composite modeling-proxy: ${(q.modelingProxyPct * 100).toFixed(0)}%. OAuth-sourced share: ${(q.oauthRowShare * 100).toFixed(0)}%. ${severity === 'critical' ? 'Account-wide decisions on this data carry high false-positive risk.' : ''}`,
        observationHe: `מתוך ${q.totalConvRows} שורות עם המרות ב-90 יום: ${q.rowsBlindAttribution} (${(q.blindAttributionPct * 100).toFixed(0)}%) חסרות metadata תקין של ייחוס, ${q.rowsGenericMapper} (${(q.genericMapperPct * 100).toFixed(0)}%) הגיעו דרך CSV mapper גנרי, ${q.rowsWithoutDailyGrain} (${(q.rolledUpPct * 100).toFixed(0)}%) הן rollup רב-יומי (ללא daily grain). Proxy מורכב: ${(q.modelingProxyPct * 100).toFixed(0)}%. שיעור OAuth: ${(q.oauthRowShare * 100).toFixed(0)}%. ${severityNarrativeHe}`,
        hypothesis: `Improve data quality by: (1) connecting OAuth (Meta + Google Ads) for native API-sourced data with full attribution metadata, (2) re-exporting CSVs from native platform with per-event breakdown (not generic exports), (3) requesting daily-granularity exports where possible. Each percentage-point reduction in "modeling proxy" correlates with ~0.3-0.5 percentage-point improvement in Smart Bidding decision accuracy (per Triple Whale 2026 benchmark).`,
        hypothesisHe: `שפרו איכות נתונים על-ידי: (1) חיבור OAuth (Meta + Google Ads) ל-data נטיב-API עם metadata מלא של ייחוס, (2) ייצוא מחדש של CSV-ים מהפלטפורמה הנטיבית עם פירוט פר-אירוע (לא ייצואים גנריים), (3) בקשת ייצואים ב-granularity יומי כשאפשר. כל נקודת אחוז של ירידה ב-"modeling proxy" מתואמת עם שיפור ~0.3-0.5 נקודות אחוז ב-Smart Bidding decision accuracy.`,
        reasoning: `In 2026, ad platforms FILL the data gaps left by iOS ATT (~75% opt-out) and EU Consent Mode v2 with statistical models. Google reports 15-40% modeled conversions in EU/iOS-heavy accounts; Meta AEM reports 20-35% on iOS. The platform's internal optimization runs on the modeled-augmented signal, but downstream tools (us) only see the aggregate — we don't know which conversions are observed vs modeled per row. Our proxies (blind attribution, generic mapper, multi-day rollup) approximate this opacity. ${actionThrustHe}`,
        reasoningHe: `ב-2026, פלטפורמות מודעות ממלאות את ה-gaps שיוצרים iOS ATT (~75% opt-out) ו-EU Consent Mode v2 עם מודלים סטטיסטיים. Google מדווח 15-40% modeled conversions בחשבונות EU/iOS-heavy; Meta AEM מדווח 20-35% ב-iOS. האופטימיזציה הפנימית של הפלטפורמה רצה על אות modeled-augmented, אבל כלים downstream (אנחנו) רואים רק את האגרגייט — אנחנו לא יודעים אילו המרות observed לעומת modeled לכל שורה. ה-proxies שלנו (blind attribution, generic mapper, multi-day rollup) מקרבים את ה-opacity הזו. ${actionThrustHe}`,

        severity,
        confidence: 0.75,
        expectedImpactKind: 'risk_mitigation',
        expectedImpactWindowDays: 90,

        evidenceSnapshot: {
            asOf: ctx.now.toISOString(),
            metrics: {
                totalConvRows: q.totalConvRows,
                rowsBlindAttribution: q.rowsBlindAttribution,
                rowsGenericMapper: q.rowsGenericMapper,
                rowsWithoutDailyGrain: q.rowsWithoutDailyGrain,
                blindAttributionPct: Number(q.blindAttributionPct.toFixed(3)),
                genericMapperPct: Number(q.genericMapperPct.toFixed(3)),
                rolledUpPct: Number(q.rolledUpPct.toFixed(3)),
                modelingProxyPct: Number(q.modelingProxyPct.toFixed(3)),
                oauthRowShare: Number(q.oauthRowShare.toFixed(3)),
            },
            window: { start: windowStart, end: windowEnd },
        },
        evidenceQualityScore: 0.85,

        proposedAction: severity === 'critical'
            ? 'PAUSE all new budget scaling. Connect Meta + Google OAuth. Re-export historical CSVs from native platforms. Re-run audit after.'
            : 'Improve data sources: prefer OAuth over CSV; native exports over generic; daily-grain over rollup. Treat current Hypothesis Engine output as directional until proxy drops below 30%.',
        proposedActionHe: severity === 'critical'
            ? 'עצרו scale תקציבי חדש. חברו OAuth של Meta + Google. ייצאו מחדש CSV-ים היסטוריים מהפלטפורמות הנטיביות. הריצו audit מחדש לאחר.'
            : 'שפרו מקורות נתונים: עדיפו OAuth על CSV; ייצואים נטיביים על גנריים; daily-grain על rollup. התייחסו ל-Hypothesis Engine כ-directional עד שה-proxy יורד מתחת ל-30%.',

        source: 'rule_engine',
    })

    return out
}