/**
 * Shared types for the data ingestion pipeline. The pipeline is:
 *
 *   raw file → classifier → mapper → validator → normalizer → dedup → DB
 *
 * Each stage hands a clean canonical shape to the next. The DB row in
 * ingested_data_points is built from NormalizedRow at the end.
 */

import type { SourceType, ClassifierOutput } from './classifier'

export type Platform =
    | 'meta'
    | 'google_ads'
    | 'microsoft_ads'
    | 'ga4'
    | 'gsc'
    | 'tiktok'
    | 'linkedin'
    | 'unknown'

export type DataType =
    | 'campaign'
    | 'adset'
    | 'ad'
    | 'keyword'
    | 'search_term'
    | 'page'
    | 'query'
    | 'account'
    | 'event'

export type PeriodGrain = 'day' | 'week' | 'month' | 'lifetime' | 'custom'

/**
 * Conversion attribution metadata. Required on EVERY row that reports
 * conversions — without it, cross-platform sums double-count.
 *
 * Mapper defaults:
 *   - Meta Ads:    '7d_click_1d_view' / 'last_click' (Meta default since 2021)
 *   - Google Ads:  '30d_click' / 'data_driven' (Google default since 2023)
 *   - GA4:         '30d_click_1d_view' / 'data_driven'
 *   - GSC:         null (organic search, no conversion attribution)
 */
export type AttributionWindow =
    | '7d_click_1d_view'
    | '7d_click'
    | '1d_view'
    | '28d_click_1d_view'
    | '28d_click'
    | '30d_click'
    | '30d_click_1d_view'
    | 'last_click'
    | 'data_driven'
    | 'lifetime'
    | 'unknown'

export type AttributionModel =
    | 'last_click'
    | 'first_click'
    | 'linear'
    | 'time_decay'
    | 'position_based'
    | 'data_driven'
    | 'unknown'

/**
 * Output of a mapper — one record per (entity, period) tuple from the source.
 * Before validation/normalization. Currency is whatever the source declared.
 */
export interface MappedRow {
    sourceType: SourceType
    sourceMode: 'upload' | 'oauth' | 'manual'
    dataType: DataType
    platform: Platform

    entityId: string
    entityName?: string

    /** ISO YYYY-MM-DD or full ISO datetime. Mapper returns whatever it parsed. */
    periodStart: string
    periodEnd: string
    periodGrain: PeriodGrain
    /** IANA TZ of the source account. Defaults to 'Asia/Jerusalem' for IL. */
    accountTz?: string
    /** Calendar day in account_tz. Populated ONLY when the row aggregates a single day. */
    periodDateLocal?: string  // YYYY-MM-DD

    // ── Attribution (required for conversion rows; null for impression-only) ──
    attributionWindow?: AttributionWindow
    attributionModel?: AttributionModel
    /** Event name from source. Use 'all' when source aggregates events. */
    conversionEventName?: string

    // Raw metrics — currency-as-declared
    impressions?: number
    clicks?: number
    spend?: number
    sourceCurrency?: string
    conversions?: number
    conversionValue?: number
    videoViews?: number
    engagements?: number
    /** NOT additive across periods — see aggregate.ts policy. */
    reach?: number
    /** NOT additive across periods. */
    frequency?: number
    position?: number

    dimensions: Record<string, string | number | boolean | null>

    /** Original CSV row / JSON object for re-mapping later if a bug is found. */
    raw: Record<string, unknown>
}

/**
 * After validator+normalizer. All money in ILS; timestamps as Date objects.
 */
export interface NormalizedRow extends Omit<MappedRow, 'spend' | 'conversionValue' | 'periodStart' | 'periodEnd' | 'periodDateLocal'> {
    periodStart: Date
    periodEnd: Date
    /** YYYY-MM-DD calendar day in account_tz (only for single-day rows). */
    periodDateLocal?: string
    spendIls?: number
    conversionValueIls?: number
    fxRate?: number
    qualityScore: number
    flags: string[]
    fingerprint: string
}

/**
 * A mapper takes (parsed CSV row data + classifier metadata) and emits
 * zero-or-more MappedRows. One CSV typically yields many rows.
 *
 * Mappers MUST be pure — no DB writes, no network. The pipeline orchestrates
 * IO in dataIngestion/index.ts. This keeps mappers testable in isolation.
 */
export interface Mapper {
    name: string
    /** Return true if this mapper recognises the file even without the classifier. Used as a safety net. */
    canHandle: (sourceType: SourceType, headers: string[]) => boolean
    map: (
        rows: Record<string, string>[],
        ctx: MapContext,
    ) => MappedRow[]
}

export interface MapContext {
    sourceType: SourceType
    classifier: ClassifierOutput
    filename: string
}

/**
 * Aggregated summary of one ingestion call — returned to the controller so
 * the UI can show "ingested 12 campaigns, ₪14,500 total spend, March-April".
 */
export interface IngestionResult {
    batchId: string
    filename: string
    detectedSource: SourceType
    confidence: number
    rowsInserted: number
    rowsRejected: number
    rejectionReasons: string[]
    periodCovered?: { start: string; end: string }
    totals: {
        impressions: number
        clicks: number
        spendIls: number
        conversions: number
    }
    warnings: string[]
}