/**
 * Evidence queries — shared aggregate SQL used by multiple generators.
 *
 * All queries here:
 *   1. Scope by instance_id first (cheap)
 *   2. Use the prorate-by-overlap discipline from dataIngestion/aggregate.ts
 *      where windowing is required
 *   3. Filter on quality_score ≥ MIN_QUALITY
 *   4. Return shape designed for direct embedding in EvidenceSnapshot.metrics
 */

import { sql } from 'drizzle-orm'
import { db } from '@/db'

const MIN_QUALITY = '0.200'

// ─── Per-campaign 30d performance (used by outlier + bidding tier mismatch) ─
export interface CampaignPerformance {
    platform: string
    entityId: string
    entityName: string
    spendIls: number
    impressions: number
    clicks: number
    conversions: number
    conversionValueIls: number
    /** Cost per acquisition. null if conversions=0. */
    cpaIls: number | null
    /** Return on ad spend. null if spend=0 or conversion_value=0. */
    roas: number | null
    /** Click-through rate. null if impressions=0. */
    ctr: number | null
    /** Conversion rate. null if clicks=0. */
    cvr: number | null
    rows: number
    /** Source attribution windows present in the row set. >1 = mixed. */
    attributionWindows: string[]
    minQualityScore: number
}

export async function campaignPerformance30d(instanceId: string): Promise<CampaignPerformance[]> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const result = await db.execute(sql`
        WITH window_rows AS (
            SELECT
                platform,
                entity_id,
                MIN(entity_name)                       AS entity_name,
                -- Prorated metrics
                SUM(COALESCE(spend_ils, 0)
                    * GREATEST(0, EXTRACT(EPOCH FROM (
                        LEAST(period_end, NOW()) - GREATEST(period_start, ${since}::timestamptz)
                      )) / 86400.0)
                    / NULLIF(GREATEST(1, EXTRACT(EPOCH FROM (period_end - period_start)) / 86400.0 + 1), 0)
                )                                       AS spend_ils,
                SUM(COALESCE(impressions, 0)
                    * GREATEST(0, EXTRACT(EPOCH FROM (
                        LEAST(period_end, NOW()) - GREATEST(period_start, ${since}::timestamptz)
                      )) / 86400.0)
                    / NULLIF(GREATEST(1, EXTRACT(EPOCH FROM (period_end - period_start)) / 86400.0 + 1), 0)
                )                                       AS impressions,
                SUM(COALESCE(clicks, 0)
                    * GREATEST(0, EXTRACT(EPOCH FROM (
                        LEAST(period_end, NOW()) - GREATEST(period_start, ${since}::timestamptz)
                      )) / 86400.0)
                    / NULLIF(GREATEST(1, EXTRACT(EPOCH FROM (period_end - period_start)) / 86400.0 + 1), 0)
                )                                       AS clicks,
                SUM(COALESCE(conversions, 0)
                    * GREATEST(0, EXTRACT(EPOCH FROM (
                        LEAST(period_end, NOW()) - GREATEST(period_start, ${since}::timestamptz)
                      )) / 86400.0)
                    / NULLIF(GREATEST(1, EXTRACT(EPOCH FROM (period_end - period_start)) / 86400.0 + 1), 0)
                )                                       AS conversions,
                SUM(COALESCE(conversion_value_ils, 0)
                    * GREATEST(0, EXTRACT(EPOCH FROM (
                        LEAST(period_end, NOW()) - GREATEST(period_start, ${since}::timestamptz)
                      )) / 86400.0)
                    / NULLIF(GREATEST(1, EXTRACT(EPOCH FROM (period_end - period_start)) / 86400.0 + 1), 0)
                )                                       AS conv_value_ils,
                ARRAY_AGG(DISTINCT attribution_window)
                    FILTER (WHERE attribution_window IS NOT NULL)  AS attr_windows,
                MIN(quality_score)                       AS min_quality,
                COUNT(*)                                 AS rows
            FROM ingested_data_points
            WHERE instance_id = ${instanceId}
              AND data_type = 'campaign'
              AND period_end >= ${since}::timestamptz
              AND quality_score >= ${MIN_QUALITY}::numeric
              AND superseded_at IS NULL
            GROUP BY platform, entity_id
        )
        SELECT * FROM window_rows
        WHERE spend_ils > 0
        ORDER BY spend_ils DESC
    `)

    return (((result as unknown) as { rows?: any[] }).rows ?? ((result as unknown) as any[])).map((r: any) => {
        const spend = Number(r.spend_ils) || 0
        const impressions = Number(r.impressions) || 0
        const clicks = Number(r.clicks) || 0
        const conversions = Number(r.conversions) || 0
        const convValue = Number(r.conv_value_ils) || 0
        return {
            platform: String(r.platform),
            entityId: String(r.entity_id),
            entityName: String(r.entity_name || r.entity_id),
            spendIls: spend,
            impressions,
            clicks,
            conversions,
            conversionValueIls: convValue,
            cpaIls: conversions > 0 ? spend / conversions : null,
            roas: spend > 0 ? convValue / spend : null,
            ctr: impressions > 0 ? clicks / impressions : null,
            cvr: clicks > 0 ? conversions / clicks : null,
            rows: Number(r.rows) || 0,
            attributionWindows: Array.isArray(r.attr_windows) ? r.attr_windows.filter(Boolean) : [],
            minQualityScore: Number(r.min_quality) || 0.5,
        }
    })
}

// ─── Attribution-quality summary (used by trackingGap generator) ───────────
export interface AttributionQualitySummary {
    totalRowsLast90d: number
    rowsWithConversions: number
    rowsWithoutAttributionWindow: number
    rowsWithoutAttributionModel: number
    rowsWithoutEventName: number
    rowsWithStaleFx: number
    attrUnknownPct: number             // 0..1
    eventUnnamedPct: number            // 0..1
}

export async function attributionQuality90d(instanceId: string): Promise<AttributionQualitySummary> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const result = await db.execute(sql`
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE conversions > 0) AS rows_with_conv,
            COUNT(*) FILTER (WHERE conversions > 0 AND (attribution_window IS NULL OR attribution_window = 'unknown')) AS no_attr_window,
            COUNT(*) FILTER (WHERE conversions > 0 AND (attribution_model IS NULL OR attribution_model = 'unknown')) AS no_attr_model,
            COUNT(*) FILTER (WHERE conversions > 0 AND conversion_event_name IS NULL) AS no_event_name,
            COUNT(*) FILTER (WHERE 'currency_fx_stale' = ANY(flags)) AS stale_fx
        FROM ingested_data_points
        WHERE instance_id = ${instanceId}
          AND period_end >= ${since}::timestamptz
          AND superseded_at IS NULL
    `)
    const r = ((((result as unknown) as { rows?: any[] }).rows ?? ((result as unknown) as any[]))[0]) || {}
    const total = Number(r.total) || 0
    const withConv = Number(r.rows_with_conv) || 0
    const noAttrWindow = Number(r.no_attr_window) || 0
    const noEventName = Number(r.no_event_name) || 0
    return {
        totalRowsLast90d: total,
        rowsWithConversions: withConv,
        rowsWithoutAttributionWindow: noAttrWindow,
        rowsWithoutAttributionModel: Number(r.no_attr_model) || 0,
        rowsWithoutEventName: noEventName,
        rowsWithStaleFx: Number(r.stale_fx) || 0,
        attrUnknownPct: withConv > 0 ? noAttrWindow / withConv : 0,
        eventUnnamedPct: withConv > 0 ? noEventName / withConv : 0,
    }
}

// ─── Frequency / reach for Meta saturation generator ──────────────────────
export interface FrequencyStat {
    platform: string
    entityId: string
    entityName: string
    avgFrequency: number
    avgReach: number
    spendIls: number
    conversions: number
    roas: number | null
    rowsCount: number
}

export async function frequencyByCampaign30d(instanceId: string): Promise<FrequencyStat[]> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    // Note: AVG(frequency) is reasonable per-campaign within a 30d window
    // because we're averaging daily/weekly samples — NOT summing them.
    // Reach we MAX (not sum) because reach is monotonic within a campaign.
    const result = await db.execute(sql`
        SELECT
            platform,
            entity_id,
            MIN(entity_name)                                          AS entity_name,
            AVG(NULLIF(frequency, 0))                                 AS avg_frequency,
            MAX(COALESCE(reach, 0))                                   AS max_reach,
            SUM(COALESCE(spend_ils, 0))                               AS spend_ils,
            SUM(COALESCE(conversions, 0))                             AS conversions,
            SUM(COALESCE(conversion_value_ils, 0))                    AS conv_value_ils,
            COUNT(*)                                                  AS rows
        FROM ingested_data_points
        WHERE instance_id = ${instanceId}
          AND platform = 'meta'
          AND data_type = 'campaign'
          AND period_end >= ${since}::timestamptz
          AND superseded_at IS NULL
          AND frequency IS NOT NULL
        GROUP BY platform, entity_id
        HAVING AVG(NULLIF(frequency, 0)) IS NOT NULL
    `)

    return (((result as unknown) as { rows?: any[] }).rows ?? ((result as unknown) as any[])).map((r: any) => {
        const spend = Number(r.spend_ils) || 0
        const convValue = Number(r.conv_value_ils) || 0
        return {
            platform: String(r.platform),
            entityId: String(r.entity_id),
            entityName: String(r.entity_name || r.entity_id),
            avgFrequency: Number(r.avg_frequency) || 0,
            avgReach: Number(r.max_reach) || 0,
            spendIls: spend,
            conversions: Number(r.conversions) || 0,
            roas: spend > 0 ? convValue / spend : null,
            rowsCount: Number(r.rows) || 0,
        }
    })
}

// ─── Daily spend pacing — front-loaded vs back-loaded vs steady ───────────
export interface PacingShape {
    platform: string
    entityId: string
    entityName: string
    /** Days the campaign was active in window. */
    activeDays: number
    /** Total spend in window. */
    totalSpendIls: number
    /** Spend in the first 30% of the window vs last 30%. */
    firstThirdSpendIls: number
    lastThirdSpendIls: number
    /** Coefficient of variation (stddev/mean) of daily spend. >0.6 = bursty. */
    spendCv: number
}

export async function pacing30d(instanceId: string): Promise<PacingShape[]> {
    // This is approximation-grade — many rows are non-daily; we sum into
    // "third of window" buckets via period_end position.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const result = await db.execute(sql`
        WITH window_meta AS (
            SELECT
                ${since}::timestamptz AS w_start,
                NOW()                  AS w_end,
                EXTRACT(EPOCH FROM (NOW() - ${since}::timestamptz)) / 86400.0 AS w_days
        ),
        per_row AS (
            SELECT
                i.platform,
                i.entity_id,
                MIN(i.entity_name) OVER (PARTITION BY i.platform, i.entity_id) AS entity_name,
                COALESCE(i.spend_ils, 0) AS spend_ils,
                EXTRACT(EPOCH FROM (i.period_end - (SELECT w_start FROM window_meta))) / 86400.0
                    / NULLIF((SELECT w_days FROM window_meta), 0)              AS norm_pos
            FROM ingested_data_points i
            WHERE i.instance_id = ${instanceId}
              AND i.data_type = 'campaign'
              AND i.period_end >= ${since}::timestamptz
              AND i.superseded_at IS NULL
              AND COALESCE(i.spend_ils, 0) > 0
        )
        SELECT
            platform,
            entity_id,
            MIN(entity_name) AS entity_name,
            COUNT(*)         AS active_days,
            SUM(spend_ils)   AS total_spend,
            SUM(spend_ils) FILTER (WHERE norm_pos <= 0.33) AS first_third,
            SUM(spend_ils) FILTER (WHERE norm_pos >= 0.67) AS last_third,
            COALESCE(STDDEV(spend_ils) / NULLIF(AVG(spend_ils), 0), 0) AS spend_cv
        FROM per_row
        GROUP BY platform, entity_id
        HAVING SUM(spend_ils) > 0
    `)

    return (((result as unknown) as { rows?: any[] }).rows ?? ((result as unknown) as any[])).map((r: any) => ({
        platform: String(r.platform),
        entityId: String(r.entity_id),
        entityName: String(r.entity_name || r.entity_id),
        activeDays: Number(r.active_days) || 0,
        totalSpendIls: Number(r.total_spend) || 0,
        firstThirdSpendIls: Number(r.first_third) || 0,
        lastThirdSpendIls: Number(r.last_third) || 0,
        spendCv: Number(r.spend_cv) || 0,
    }))
}