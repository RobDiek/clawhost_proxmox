/**
 * Universal Data Ingestion — entrypoint.
 *
 * Pipeline:  raw file/buffer → classifier → router → mapper → normalize → DB upsert
 *
 * Used by:
 *   - /paid-profile/historical-reports endpoint (file upload path)
 *   - OAuth-based pulls (Meta/Google Ads/GA4/GSC) once they're wired (each
 *     will hand canonical MappedRow[] directly here, bypassing classifier)
 *   - admin manual-entry tools (future)
 *
 * Idempotency: every row carries a SHA-256 fingerprint of
 * (instanceId, source, entity, period_start, period_end). Re-ingesting the
 * same file UPSERTs — no duplicates, freshest data wins.
 */

import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { ingestedDataPoints } from '@/db/schema'
import { classifyFile, type ClassifierOutput, type SourceType } from './classifier'
import { parseCsv } from './csvParser'
import { processRows } from './normalize'
import type {
    Mapper, MappedRow, NormalizedRow, IngestionResult,
} from './types'

import { metaAdsCsvMapper } from './mappers/meta_ads_csv'
import { googleAdsCsvMapper } from './mappers/google_ads_csv'
import { ga4ExportCsvMapper } from './mappers/ga4_export_csv'
import { gscExportCsvMapper } from './mappers/gsc_export_csv'
import { genericMapper } from './mappers/generic'

// ─── Mapper registry ─────────────────────────────────────────────────────
// Order matters: more specific mappers first; generic is last-resort.
const MAPPERS: Mapper[] = [
    metaAdsCsvMapper,
    googleAdsCsvMapper,
    ga4ExportCsvMapper,
    gscExportCsvMapper,
    genericMapper,
]

function pickMapper(sourceType: SourceType, headers: string[]): Mapper {
    // First pass: prefer the mapper that matches the classifier output
    for (const m of MAPPERS) {
        if (m.name === sourceType) return m
    }
    // Second pass: ask each mapper if its canHandle() recognises the headers
    for (const m of MAPPERS) {
        if (m.canHandle(sourceType, headers)) return m
    }
    return genericMapper
}

// ─── Insert with upsert on fingerprint ───────────────────────────────────
async function persistRows(opts: {
    instanceId: string
    agentId?: string | null
    batchId: string
    rows: NormalizedRow[]
    sourceMeta: Record<string, unknown>
}): Promise<number> {
    if (opts.rows.length === 0) return 0

    // Augment fingerprint with instanceId — done late since mappers don't
    // know the instance. Keeps mappers pure / unit-testable.
    const records = opts.rows.map(r => {
        const fingerprint = createHash('sha256')
            .update([opts.instanceId, r.fingerprint].join('|'))
            .digest('hex')

        return {
            instanceId: opts.instanceId,
            agentId: opts.agentId ?? null,
            sourceType: r.sourceType,
            sourceMode: r.sourceMode,
            ingestionBatchId: opts.batchId,
            sourceMeta: opts.sourceMeta,
            dataType: r.dataType,
            entityId: r.entityId,
            entityName: r.entityName ?? null,
            platform: r.platform,
            periodStart: r.periodStart,
            periodEnd: r.periodEnd,
            periodGrain: r.periodGrain,
            accountTz: r.accountTz ?? null,
            periodDateLocal: r.periodDateLocal ?? null,
            attributionWindow: r.attributionWindow ?? null,
            attributionModel: r.attributionModel ?? null,
            conversionEventName: r.conversionEventName ?? null,
            impressions: r.impressions ?? null,
            clicks: r.clicks ?? null,
            spendIls: r.spendIls !== undefined ? String(r.spendIls.toFixed(4)) : null,
            sourceCurrency: r.sourceCurrency ?? null,
            fxRate: r.fxRate !== undefined ? String(r.fxRate.toFixed(6)) : null,
            conversions: r.conversions !== undefined ? String(r.conversions) : null,
            conversionValueIls: r.conversionValueIls !== undefined ? String(r.conversionValueIls.toFixed(4)) : null,
            videoViews: r.videoViews ?? null,
            engagements: r.engagements ?? null,
            reach: r.reach ?? null,
            frequency: r.frequency !== undefined ? String(r.frequency) : null,
            position: r.position !== undefined ? String(r.position) : null,
            dimensions: r.dimensions,
            raw: r.raw,
            qualityScore: String(r.qualityScore.toFixed(3)),
            flags: r.flags,
            fingerprint,
        }
    })

    // Pre-dedup safety net: if two rows in this batch have the SAME
    // fingerprint, postgres will fail the whole insert with
    // "ON CONFLICT DO UPDATE command cannot affect row a second time".
    // This happens when mapper dimensions don't fully disambiguate (e.g.
    // an export breakdown column we haven't mapped yet). Collapse same-
    // fingerprint rows in-batch with last-write-wins + log so it's visible.
    const fpMap = new Map<string, typeof records[0]>()
    for (const r of records) {
        if (fpMap.has(r.fingerprint)) {
            console.warn(`[dataIngestion] intra-batch fingerprint collision (last-wins): ${r.entityName} period=${r.periodStart}..${r.periodEnd}`)
        }
        fpMap.set(r.fingerprint, r)
    }
    const dedupedRecords = Array.from(fpMap.values())

    // Batch-insert with ON CONFLICT(fingerprint) DO UPDATE — fresher data wins.
    // Drizzle's onConflictDoUpdate uses the unique constraint name; we built
    // `idp_fingerprint_uniq` in the migration.
    await db.insert(ingestedDataPoints)
        .values(dedupedRecords as any)
        .onConflictDoUpdate({
            target: ingestedDataPoints.fingerprint,
            set: {
                impressions: sql`EXCLUDED.impressions`,
                clicks: sql`EXCLUDED.clicks`,
                spendIls: sql`EXCLUDED.spend_ils`,
                sourceCurrency: sql`EXCLUDED.source_currency`,
                fxRate: sql`EXCLUDED.fx_rate`,
                conversions: sql`EXCLUDED.conversions`,
                conversionValueIls: sql`EXCLUDED.conversion_value_ils`,
                videoViews: sql`EXCLUDED.video_views`,
                engagements: sql`EXCLUDED.engagements`,
                reach: sql`EXCLUDED.reach`,
                frequency: sql`EXCLUDED.frequency`,
                position: sql`EXCLUDED.position`,
                accountTz: sql`EXCLUDED.account_tz`,
                periodDateLocal: sql`EXCLUDED.period_date_local`,
                attributionWindow: sql`EXCLUDED.attribution_window`,
                attributionModel: sql`EXCLUDED.attribution_model`,
                conversionEventName: sql`EXCLUDED.conversion_event_name`,
                dimensions: sql`EXCLUDED.dimensions`,
                raw: sql`EXCLUDED.raw`,
                qualityScore: sql`EXCLUDED.quality_score`,
                flags: sql`EXCLUDED.flags`,
                sourceMeta: sql`EXCLUDED.source_meta`,
                ingestionBatchId: sql`EXCLUDED.ingestion_batch_id`,
                ingestedAt: sql`NOW()`,
            },
        })

    return dedupedRecords.length
}

// ─── Public entrypoint: ingest one uploaded file ─────────────────────────
export interface IngestFileInput {
    instanceId: string
    agentId?: string | null
    filename: string
    mimeType: string
    buffer: Buffer
    /** If known, skip the classifier (e.g. for OAuth pulls). */
    knownSource?: SourceType
}

export async function ingestFile(input: IngestFileInput): Promise<IngestionResult> {
    const batchId = createHash('sha256')
        .update([input.instanceId, input.filename, Date.now(), Math.random()].join('|'))
        .digest('hex')
        .slice(0, 16)

    let classifier: ClassifierOutput
    if (input.knownSource) {
        classifier = {
            detectedSource: input.knownSource,
            confidence: 1.0,
            evidence: ['oauth-pull or admin-asserted'],
            rowsCount: 0,
            warnings: [],
        }
    } else {
        classifier = await classifyFile({
            instanceId: input.instanceId,
            filename: input.filename,
            mimeType: input.mimeType,
            buffer: input.buffer,
        })
    }

    // Phase 1a only supports CSV/spreadsheet flows; PDF + screenshot mappers
    // are placeholder-ready but the file→rows extractor for them is Phase 1b.
    const isCsv = /csv|excel|spreadsheet/i.test(input.mimeType) || /\.csv$/i.test(input.filename)
    if (!isCsv) {
        return {
            batchId,
            filename: input.filename,
            detectedSource: classifier.detectedSource,
            confidence: classifier.confidence,
            rowsInserted: 0,
            rowsRejected: 0,
            rejectionReasons: [],
            warnings: [...classifier.warnings, 'non_csv_extraction_pending'],
            totals: { impressions: 0, clicks: 0, spendIls: 0, conversions: 0 },
        }
    }

    const parsed = parseCsv(input.buffer)
    if (parsed.rows.length === 0) {
        return {
            batchId,
            filename: input.filename,
            detectedSource: classifier.detectedSource,
            confidence: classifier.confidence,
            rowsInserted: 0,
            rowsRejected: 0,
            rejectionReasons: ['empty_csv'],
            warnings: classifier.warnings,
            totals: { impressions: 0, clicks: 0, spendIls: 0, conversions: 0 },
        }
    }

    const mapper = pickMapper(classifier.detectedSource, parsed.headers)
    const mapped: MappedRow[] = mapper.map(parsed.rows, {
        sourceType: classifier.detectedSource,
        classifier,
        filename: input.filename,
    })

    const { rows: normalized, rejected } = await processRows(mapped)

    const sourceMeta = {
        filename: input.filename,
        mimeType: input.mimeType,
        bytes: input.buffer.length,
        classifierConfidence: classifier.confidence,
        classifierEvidence: classifier.evidence,
        mapperName: mapper.name,
        delimiter: parsed.delimiter,
        headers: parsed.headers,
    }

    const inserted = await persistRows({
        instanceId: input.instanceId,
        agentId: input.agentId,
        batchId,
        rows: normalized,
        sourceMeta,
    })

    // Aggregate totals for the controller response
    const totals = normalized.reduce((acc, r) => ({
        impressions: acc.impressions + (r.impressions || 0),
        clicks: acc.clicks + (r.clicks || 0),
        spendIls: acc.spendIls + (r.spendIls || 0),
        conversions: acc.conversions + (r.conversions || 0),
    }), { impressions: 0, clicks: 0, spendIls: 0, conversions: 0 })

    // Period covered: min(periodStart) … max(periodEnd) across normalized rows
    let periodCovered: { start: string; end: string } | undefined
    if (normalized.length > 0) {
        const starts = normalized.map(r => r.periodStart.getTime())
        const ends = normalized.map(r => r.periodEnd.getTime())
        periodCovered = {
            start: new Date(Math.min(...starts)).toISOString().slice(0, 10),
            end: new Date(Math.max(...ends)).toISOString().slice(0, 10),
        }
    }

    return {
        batchId,
        filename: input.filename,
        detectedSource: classifier.detectedSource,
        confidence: classifier.confidence,
        rowsInserted: inserted,
        rowsRejected: rejected.length,
        rejectionReasons: [...new Set(rejected.map(r => r.reason))],
        periodCovered,
        totals: {
            impressions: Math.round(totals.impressions),
            clicks: Math.round(totals.clicks),
            spendIls: Number(totals.spendIls.toFixed(2)),
            conversions: Number(totals.conversions.toFixed(2)),
        },
        warnings: classifier.warnings,
    }
}

// ─── Public entrypoint: ingest already-mapped rows (OAuth pull path) ─────
/**
 * Skip classifier/CSV-parser; the caller (OAuth services) already has
 * canonical rows. Used by services/googleAds.ts pulls and future Meta
 * Insights API pulls.
 */
export async function ingestMappedRows(opts: {
    instanceId: string
    agentId?: string | null
    sourceType: SourceType
    rows: MappedRow[]
    sourceMeta?: Record<string, unknown>
}): Promise<{ batchId: string; inserted: number; rejected: number }> {
    const batchId = createHash('sha256')
        .update([opts.instanceId, opts.sourceType, Date.now(), Math.random()].join('|'))
        .digest('hex')
        .slice(0, 16)

    const { rows: normalized, rejected } = await processRows(opts.rows)
    const inserted = await persistRows({
        instanceId: opts.instanceId,
        agentId: opts.agentId,
        batchId,
        rows: normalized,
        sourceMeta: opts.sourceMeta || { source: opts.sourceType },
    })

    return { batchId, inserted, rejected: rejected.length }
}