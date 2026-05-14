/**
 * Generic fallback mapper for CSV files that the classifier couldn't
 * confidently identify. Tries to find any column matching a list of
 * common metric names (case-insensitive, accepts Hebrew + English) and
 * emits one row per CSV row with platform='unknown' and dataType='account'.
 *
 * Used when:
 *   - Classifier confidence < 0.6
 *   - Source is `generic_csv` or `unknown`
 *   - A specific mapper's canHandle() returned false
 *
 * Quality scorer downweights these heavily so analytics doesn't draw
 * confident conclusions from rows we couldn't structurally identify.
 */

import { pickColumn, parseLocaleNumber } from '../csvParser'
import type { Mapper, MappedRow, MapContext, DataType, Platform } from '../types'

const NAME_HEADERS = ['name', 'Name', 'Campaign', 'Campaign name', 'שם', 'שם הקמפיין', 'קמפיין']
const IMPR_HEADERS = ['Impressions', 'Impr.', 'Views', 'חשיפות', 'צפיות', 'הופעות']
const CLICKS_HEADERS = ['Clicks', 'Click', 'קליקים']
const COST_HEADERS = ['Cost', 'Spend', 'Amount spent', 'עלות', 'הוצאה', 'סכום שהוצא']
const CONV_HEADERS = ['Conversions', 'Results', 'Conv.', 'המרות', 'תוצאות']
const REVENUE_HEADERS = ['Revenue', 'Conv. value', 'ערך ההמרה', 'הכנסה']
const DATE_HEADERS = ['Date', 'Day', 'Period', 'תאריך', 'יום']

function parseDate(raw: string | undefined): string | undefined {
    if (!raw) return undefined
    const s = raw.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
    if (m) {
        const [, d, mo, y] = m
        const yyyy = y.length === 2 ? `20${y}` : y
        return `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return undefined
}

export const genericMapper: Mapper = {
    name: 'generic',
    canHandle: () => true,   // fallback always handles
    map(rows: Record<string, string>[], ctx: MapContext): MappedRow[] {
        if (rows.length === 0) return []
        const out: MappedRow[] = []
        for (const row of rows) {
            const name = pickColumn(row, NAME_HEADERS) || 'unknown_entity'
            const date = parseDate(pickColumn(row, DATE_HEADERS))
            const periodStart = date || ctx.classifier.dateRange?.start || new Date().toISOString().slice(0, 10)
            const periodEnd = date || ctx.classifier.dateRange?.end || periodStart
            const periodGrain = date ? 'day' : (ctx.classifier.dateRange ? 'custom' : 'lifetime')

            const impressions = parseLocaleNumber(pickColumn(row, IMPR_HEADERS))
            const clicks = parseLocaleNumber(pickColumn(row, CLICKS_HEADERS))
            const spend = parseLocaleNumber(pickColumn(row, COST_HEADERS))
            const conversions = parseLocaleNumber(pickColumn(row, CONV_HEADERS))
            const conversionValue = parseLocaleNumber(pickColumn(row, REVENUE_HEADERS))

            const dataType: DataType = 'account'
            const platform: Platform = 'unknown'

            const periodDateLocal = periodGrain === 'day' ? periodStart : undefined

            out.push({
                sourceType: 'generic_csv',
                sourceMode: 'upload',
                dataType,
                platform,
                entityId: name,
                entityName: name,
                periodStart,
                periodEnd,
                periodGrain,
                accountTz: 'Asia/Jerusalem',
                periodDateLocal,
                // Generic source — we don't know the attribution. Marking as
                // 'unknown' lets the quality scorer downweight + the
                // Hypothesis Engine treat with skepticism.
                attributionWindow: 'unknown',
                attributionModel: 'unknown',
                conversionEventName: conversions !== undefined ? 'all' : undefined,
                impressions,
                clicks,
                spend,
                sourceCurrency: ctx.classifier.currency || 'ILS',
                conversions,
                conversionValue,
                dimensions: {},
                raw: { ...row },
            })
        }
        return out
    },
}