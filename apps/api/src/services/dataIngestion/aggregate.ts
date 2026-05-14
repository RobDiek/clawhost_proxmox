/**
 * Aggregate queries over ingested_data_points.
 *
 * Three correctness disciplines enforced here (Phase 4.1 hardening):
 *
 *   1. NEVER SUM conversions cross-platform without explicit dedup model.
 *      Meta 7d-click+1d-view and Google 30d-data-driven count overlapping
 *      conversions differently — adding them double-counts. Default is to
 *      return per-platform breakdowns; the caller decides if/how to combine.
 *
 *   2. PRORATE custom/lifetime-grain rows by overlap-days when scoping to
 *      a time window. If a row covers 2026-02-26..2026-04-30 (64 days) and
 *      the caller asks for the last 90 days, the row's spend/conversions
 *      are scaled by (overlap_days / period_days). Without this, a single
 *      annual rollup row would inflate the 90d aggregate by ~4x.
 *
 *   3. NEVER SUM reach or frequency. They're inherently non-additive
 *      (overlap across periods). Callers who need reach should query
 *      per-row at the source-reported grain and let the analyst layer
 *      handle dedup with the proper inclusion-exclusion formula.
 *
 * Consumers:
 *   - paidDataInventory.ts → spend90d + conv30d per platform → tier
 *   - mazhirAudit / paid_audit → windowed stats for hypothesis seeding
 *   - dashboard widgets → "last 30 days" totals
 */

import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/db'
import { ingestedDataPoints } from '@/db/schema'

const MIN_QUALITY = '0.200'

// ─── SQL fragment: per-row prorate-by-overlap-days ────────────────────────
// Given a window [since, now], compute the row's contribution as
// metric * overlap_days / total_period_days. We use period_end - period_start
// in days for the denominator; +1 because both endpoints are inclusive.
// Single-day rows (period_start = period_end) get a 0-day denominator unless
// we coalesce to 1 — handled via NULLIF guard.
//
// The clamp: overlap_days = MAX(0, MIN(period_end, now) - MAX(period_start, since)).
//
// IMPORTANT: this assumes the row's metrics are uniformly distributed across
// the period — which is the only sane assumption for lifetime rollups (the
// only alternative is to drop them, which is worse).
function prorateExpr(col: string, sinceParam: Date) {
    const sinceIso = sinceParam.toISOString()
    return sql.raw(`
        COALESCE(${col}, 0)
        * GREATEST(0, EXTRACT(EPOCH FROM (
            LEAST(period_end, NOW()) - GREATEST(period_start, '${sinceIso}'::timestamptz)
          )) / 86400.0)
        / NULLIF(GREATEST(1, EXTRACT(EPOCH FROM (period_end - period_start)) / 86400.0 + 1), 0)
    `)
}

export interface PlatformAggregate {
    platform: string
    /** Sum of spend in ILS, prorated for rows that span outside the window. */
    spendIls: number
    impressions: number
    clicks: number
    /** Sum of conversions WITHIN this platform only. NEVER add across platforms. */
    conversions: number
    /** Sum of conversion_value in ILS. */
    conversionValueIls: number
    /** Distinct conversion event names present. Hints whether to split downstream. */
    eventNames: string[]
    /** Distinct attribution-window strings used. >1 means mixed-attribution data. */
    attributionWindows: string[]
    /** Number of source rows that contributed. */
    rows: number
}

export interface TierAggregateResult {
    /** Per-platform breakdown — NEVER summed across in tier logic. */
    byPlatform: PlatformAggregate[]
    /** Convenience: dominant platform (highest spend). For tier classification. */
    dominantPlatform: string | null
    /** Per-platform 30d spend/conv plus the 90d versions. */
    spend90dIls: number       // sum of per-platform 90d spend; tier uses dominantPlatform.spend90dIls
    conv90d: number
    spend30dIls: number
    conv30d: number
    daysSinceLastSpend: number | null
    lastIngestedAt: Date | null
    rowsCount: number
}

/**
 * Per-platform 30d + 90d aggregate. Caller (paidDataInventory) tier-classifies
 * each platform separately — final tier = max tier achievable on any platform.
 *
 * Note on "days since last spend": we look at the most recent period_end with
 * positive spend in the ingestion table. For OAuth pulls this is reasonably
 * fresh (cron-pulled daily); for upload-only users it's the latest day in
 * their CSVs — which is the right semantic for tier classification ("when
 * did this account last show activity?").
 */
export async function aggregateForTier(instanceId: string): Promise<TierAggregateResult> {
    const now = new Date()
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    // ── 90-day window, prorated, per-platform ────────────────────────────
    const platforms90 = await db.execute(sql`
        SELECT
            platform,
            COALESCE(SUM(${prorateExpr('spend_ils', d90)}), 0)            AS spend_ils,
            COALESCE(SUM(${prorateExpr('impressions', d90)}), 0)          AS impressions,
            COALESCE(SUM(${prorateExpr('clicks', d90)}), 0)               AS clicks,
            COALESCE(SUM(${prorateExpr('conversions', d90)}), 0)          AS conversions,
            COALESCE(SUM(${prorateExpr('conversion_value_ils', d90)}), 0) AS conv_value_ils,
            ARRAY_AGG(DISTINCT conversion_event_name) FILTER (WHERE conversion_event_name IS NOT NULL)  AS event_names,
            ARRAY_AGG(DISTINCT attribution_window)    FILTER (WHERE attribution_window    IS NOT NULL)  AS attr_windows,
            COUNT(*)                                                                                    AS rows
        FROM ingested_data_points
        WHERE instance_id = ${instanceId}
          AND period_end >= ${d90}
          AND quality_score >= ${MIN_QUALITY}::numeric
          AND superseded_at IS NULL
        GROUP BY platform
    `)

    // ── 30-day window, prorated, per-platform — only need spend+conv ─────
    const platforms30 = await db.execute(sql`
        SELECT
            platform,
            COALESCE(SUM(${prorateExpr('spend_ils', d30)}), 0)     AS spend_ils,
            COALESCE(SUM(${prorateExpr('conversions', d30)}), 0)   AS conversions
        FROM ingested_data_points
        WHERE instance_id = ${instanceId}
          AND period_end >= ${d30}
          AND quality_score >= ${MIN_QUALITY}::numeric
          AND superseded_at IS NULL
        GROUP BY platform
    `)

    const platforms30Map = new Map<string, { spend: number; conv: number }>()
    for (const r of ((platforms30 as unknown) as { rows?: any[] }).rows ?? ((platforms30 as unknown) as any[])) {
        platforms30Map.set(String(r.platform), {
            spend: Number(r.spend_ils),
            conv: Number(r.conversions),
        })
    }

    const byPlatform: PlatformAggregate[] = []
    let spend90dTotal = 0
    let conv90dTotal = 0
    let spend30dTotal = 0
    let conv30dTotal = 0
    let totalRows = 0

    for (const r of (((platforms90 as unknown) as { rows?: any[] }).rows ?? ((platforms90 as unknown) as any[]))) {
        const platform = String(r.platform)
        const spend90 = Number(r.spend_ils)
        const conv90 = Number(r.conversions)
        const rows = Number(r.rows)
        spend90dTotal += spend90
        conv90dTotal += conv90
        totalRows += rows
        const p30 = platforms30Map.get(platform) || { spend: 0, conv: 0 }
        spend30dTotal += p30.spend
        conv30dTotal += p30.conv
        byPlatform.push({
            platform,
            spendIls: spend90,
            impressions: Number(r.impressions),
            clicks: Number(r.clicks),
            conversions: conv90,
            conversionValueIls: Number(r.conv_value_ils),
            eventNames: Array.isArray(r.event_names) ? r.event_names.filter(Boolean) : [],
            attributionWindows: Array.isArray(r.attr_windows) ? r.attr_windows.filter(Boolean) : [],
            rows,
        })
    }

    const dominantPlatform = byPlatform.length === 0 ? null
        : byPlatform.reduce((max, p) => p.spendIls > max.spendIls ? p : max, byPlatform[0]).platform

    // ── Most recent period_end with positive spend (any window) ───────────
    const [lastSpend] = await db
        .select({ periodEnd: ingestedDataPoints.periodEnd })
        .from(ingestedDataPoints)
        .where(and(
            eq(ingestedDataPoints.instanceId, instanceId),
            sql`${ingestedDataPoints.spendIls} > 0`,
            sql`${ingestedDataPoints.supersededAt} IS NULL`,
        ))
        .orderBy(sql`${ingestedDataPoints.periodEnd} DESC`)
        .limit(1)

    const [lastIngest] = await db
        .select({ ingestedAt: ingestedDataPoints.ingestedAt })
        .from(ingestedDataPoints)
        .where(eq(ingestedDataPoints.instanceId, instanceId))
        .orderBy(sql`${ingestedDataPoints.ingestedAt} DESC`)
        .limit(1)

    const daysSinceLastSpend = lastSpend?.periodEnd
        ? Math.floor((now.getTime() - new Date(lastSpend.periodEnd).getTime()) / (24 * 60 * 60 * 1000))
        : null

    return {
        byPlatform,
        dominantPlatform,
        spend90dIls: spend90dTotal,
        conv90d: conv90dTotal,
        spend30dIls: spend30dTotal,
        conv30d: conv30dTotal,
        daysSinceLastSpend,
        lastIngestedAt: lastIngest?.ingestedAt || null,
        rowsCount: totalRows,
    }
}

/**
 * Per-platform rollup over a custom window. Used by paid_audit + dashboard.
 * Same prorate discipline as aggregateForTier.
 */
export async function aggregateByPlatform(instanceId: string, days = 90): Promise<PlatformAggregate[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const result = await db.execute(sql`
        SELECT
            platform,
            COALESCE(SUM(${prorateExpr('spend_ils', since)}), 0)            AS spend_ils,
            COALESCE(SUM(${prorateExpr('impressions', since)}), 0)          AS impressions,
            COALESCE(SUM(${prorateExpr('clicks', since)}), 0)               AS clicks,
            COALESCE(SUM(${prorateExpr('conversions', since)}), 0)          AS conversions,
            COALESCE(SUM(${prorateExpr('conversion_value_ils', since)}), 0) AS conv_value_ils,
            ARRAY_AGG(DISTINCT conversion_event_name) FILTER (WHERE conversion_event_name IS NOT NULL) AS event_names,
            ARRAY_AGG(DISTINCT attribution_window)    FILTER (WHERE attribution_window    IS NOT NULL) AS attr_windows,
            COUNT(*) AS rows
        FROM ingested_data_points
        WHERE instance_id = ${instanceId}
          AND period_end >= ${since}
          AND superseded_at IS NULL
        GROUP BY platform
    `)

    return (((result as unknown) as { rows?: any[] }).rows ?? ((result as unknown) as any[])).map((r: any) => ({
        platform: String(r.platform),
        spendIls: Number(r.spend_ils),
        impressions: Number(r.impressions),
        clicks: Number(r.clicks),
        conversions: Number(r.conversions),
        conversionValueIls: Number(r.conv_value_ils),
        eventNames: Array.isArray(r.event_names) ? r.event_names.filter(Boolean) : [],
        attributionWindows: Array.isArray(r.attr_windows) ? r.attr_windows.filter(Boolean) : [],
        rows: Number(r.rows),
    }))
}

/**
 * Per-platform × per-event breakdown. Critical for Hypothesis Engine:
 * "your Meta `messaging_conversation_started` CPA is ₪3 but `purchase` CPA
 * is ₪89 — should these be split campaigns?"
 */
export async function aggregateByEvent(instanceId: string, days = 90): Promise<Array<{
    platform: string
    eventName: string
    attributionWindow: string | null
    spendIls: number
    conversions: number
    conversionValueIls: number
    rows: number
}>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const result = await db.execute(sql`
        SELECT
            platform,
            COALESCE(conversion_event_name, 'all') AS event_name,
            attribution_window,
            COALESCE(SUM(${prorateExpr('spend_ils', since)}), 0)            AS spend_ils,
            COALESCE(SUM(${prorateExpr('conversions', since)}), 0)          AS conversions,
            COALESCE(SUM(${prorateExpr('conversion_value_ils', since)}), 0) AS conv_value_ils,
            COUNT(*) AS rows
        FROM ingested_data_points
        WHERE instance_id = ${instanceId}
          AND period_end >= ${since}
          AND superseded_at IS NULL
        GROUP BY platform, COALESCE(conversion_event_name, 'all'), attribution_window
    `)

    return (((result as unknown) as { rows?: any[] }).rows ?? ((result as unknown) as any[])).map((r: any) => ({
        platform: String(r.platform),
        eventName: String(r.event_name),
        attributionWindow: r.attribution_window || null,
        spendIls: Number(r.spend_ils),
        conversions: Number(r.conversions),
        conversionValueIls: Number(r.conv_value_ils),
        rows: Number(r.rows),
    }))
}