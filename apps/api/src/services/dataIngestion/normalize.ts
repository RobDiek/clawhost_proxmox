/**
 * Validate + normalize + dedup + score mapped rows.
 *
 * - Validator drops impossible rows (impressions < clicks, future dates,
 *   negative spend). Rows that are merely *suspicious* are kept but flagged
 *   so downstream analyses can choose to exclude them.
 * - Normalizer converts source-currency money to ILS (using fx.ts), and
 *   converts date strings to UTC Date objects.
 * - Dedup uses a deterministic fingerprint so re-uploads of the same file
 *   silently UPSERT instead of creating duplicate rows.
 * - Quality score is a 0..1 composite used by the hypothesis engine to
 *   weight evidence (higher score = trust this row more).
 */

import { createHash } from 'node:crypto'
import { toIls } from './fx'
import type { MappedRow, NormalizedRow } from './types'

export interface NormalizeResult {
    rows: NormalizedRow[]
    rejected: { row: MappedRow; reason: string }[]
}

// ─── Validator ────────────────────────────────────────────────────────────
function validate(row: MappedRow): { ok: boolean; reason?: string; flags: string[] } {
    const flags: string[] = []
    const now = new Date()

    // Hard rejects
    if (row.spend !== undefined && row.spend < 0) {
        return { ok: false, reason: 'negative_spend', flags }
    }
    if (row.impressions !== undefined && row.clicks !== undefined && row.impressions < row.clicks) {
        return { ok: false, reason: 'clicks_exceed_impressions', flags }
    }

    const ps = new Date(row.periodStart)
    const pe = new Date(row.periodEnd)
    if (Number.isNaN(ps.getTime()) || Number.isNaN(pe.getTime())) {
        return { ok: false, reason: 'invalid_period_dates', flags }
    }
    if (ps.getTime() > pe.getTime()) {
        return { ok: false, reason: 'period_start_after_end', flags }
    }
    // Reject impossibly old (>10 years) — almost certainly a parse bug
    const tenYearsAgo = new Date(now.getFullYear() - 10, 0, 1)
    if (pe.getTime() < tenYearsAgo.getTime()) {
        return { ok: false, reason: 'period_too_old', flags }
    }

    // Soft flags
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    if (ps.getTime() > tomorrow.getTime()) flags.push('future_date')
    if (row.spend !== undefined && row.spend > 1_000_000) flags.push('unusual_high_spend')
    if (row.clicks !== undefined && row.impressions !== undefined && row.impressions > 0) {
        const ctr = row.clicks / row.impressions
        if (ctr > 0.5) flags.push('unusual_high_ctr')   // >50% CTR is almost always wrong
    }
    if (row.conversions !== undefined && row.clicks !== undefined && row.clicks > 0) {
        if (row.conversions > row.clicks * 2) flags.push('conversions_exceed_clicks_2x')
    }
    if (!row.entityName) flags.push('missing_entity_name')

    return { ok: true, flags }
}

// ─── Normalizer ───────────────────────────────────────────────────────────
async function normalize(row: MappedRow, baseFlags: string[]): Promise<NormalizedRow | null> {
    const flags = [...baseFlags]

    // Currency conversion
    let spendIls: number | undefined
    let conversionValueIls: number | undefined
    let fxRate: number | undefined
    const currency = row.sourceCurrency || 'ILS'

    if (row.spend !== undefined) {
        const conv = await toIls(row.spend, currency)
        spendIls = conv.amountIls
        fxRate = conv.fxRate
        if (conv.stale) flags.push('currency_fx_stale')
    }
    if (row.conversionValue !== undefined) {
        const conv = await toIls(row.conversionValue, currency)
        conversionValueIls = conv.amountIls
        if (fxRate === undefined) fxRate = conv.fxRate
        if (conv.stale && !flags.includes('currency_fx_stale')) flags.push('currency_fx_stale')
    }

    const periodStart = new Date(row.periodStart)
    const periodEnd = new Date(row.periodEnd)

    // Attribution-presence flags. Conversion rows without attribution metadata
    // are risky to aggregate cross-platform — flag so the Hypothesis Engine
    // treats with skepticism.
    if (row.conversions !== undefined) {
        if (!row.attributionWindow || row.attributionWindow === 'unknown') {
            flags.push('attribution_window_unknown')
        }
        if (!row.attributionModel || row.attributionModel === 'unknown') {
            flags.push('attribution_model_unknown')
        }
        if (!row.conversionEventName) flags.push('conversion_event_unnamed')
    }

    // Quality score:
    //   - Base 0.5
    //   - +0.08 per signal-column populated
    //   - +0.05 if attribution metadata complete
    //   - +0.05 if OAuth source (data is canonical, not user-typed)
    //   - +0.05 if period_date_local set (single-day grain is reliable)
    //   - -0.07 per soft flag
    //   - Cap [0.1, 1.0]
    const signalsPresent = [
        row.impressions, row.clicks, row.spend,
        row.conversions, row.conversionValue,
    ].filter(v => v !== undefined).length
    let qualityScore = 0.5 + signalsPresent * 0.08
    if (row.attributionWindow && row.attributionWindow !== 'unknown'
        && row.attributionModel && row.attributionModel !== 'unknown') {
        qualityScore += 0.05
    }
    if (row.sourceMode === 'oauth') qualityScore += 0.05
    if (row.periodDateLocal) qualityScore += 0.05
    qualityScore -= flags.length * 0.07
    qualityScore = Math.max(0.1, Math.min(1.0, qualityScore))

    // Fingerprint: deterministic dedup. Same (entity, period, event, attribution)
    // for the same instance + source = same row, silently upsert.
    // CRITICAL: includes conversion_event_name + attribution_window so a campaign
    // exported with both 7d_click_1d_view AND 28d_click_1d_view views (Meta lets
    // you do this) keeps both rows instead of collapsing them.
    const fp = createHash('sha256')
        .update([
            row.sourceType,
            row.platform,
            row.entityId,
            row.dataType,
            periodStart.toISOString(),
            periodEnd.toISOString(),
            row.conversionEventName || 'no_event',
            row.attributionWindow || 'no_window',
        ].join('|'))
        .digest('hex')

    return {
        ...row,
        periodStart,
        periodEnd,
        spendIls,
        conversionValueIls,
        fxRate,
        qualityScore: Number(qualityScore.toFixed(3)),
        flags,
        fingerprint: fp,
    }
}

/**
 * Pipeline: validate + normalize + score. Rejected rows surfaced separately
 * so the controller can show "12 ingested, 2 rejected (negative_spend)".
 */
export async function processRows(rows: MappedRow[]): Promise<NormalizeResult> {
    const out: NormalizedRow[] = []
    const rejected: { row: MappedRow; reason: string }[] = []

    for (const row of rows) {
        const v = validate(row)
        if (!v.ok) {
            rejected.push({ row, reason: v.reason || 'unknown' })
            continue
        }
        const norm = await normalize(row, v.flags)
        if (norm) out.push(norm)
    }

    return { rows: out, rejected }
}