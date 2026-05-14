/**
 * Google Search Console CSV export mapper.
 * GSC exports come from the Performance report and have these shapes:
 *   - Queries:  Query / Clicks / Impressions / CTR / Position
 *   - Pages:    Page / Clicks / Impressions / CTR / Position
 *   - Dates:    Date / Clicks / Impressions / CTR / Position
 *   - Countries: Country / Clicks / ...
 *
 * We map all to dataType='query' or 'page' and stash extras in dimensions.
 * No spend (organic).
 */

import { pickColumn, parseLocaleNumber } from '../csvParser'
import type { Mapper, MappedRow, MapContext } from '../types'

const GSC_QUERY_HEADERS = ['Query', 'Top queries', 'שאילתה', 'שאילתות מובילות']
const GSC_PAGE_HEADERS = ['Page', 'Top pages', 'דף', 'דפים מובילים']
const GSC_DATE_HEADERS = ['Date', 'תאריך']
const GSC_COUNTRY_HEADERS = ['Country', 'מדינה']
const GSC_DEVICE_HEADERS = ['Device', 'מכשיר']

const GSC_CLICKS_HEADERS = ['Clicks', 'קליקים']
const GSC_IMPRESSIONS_HEADERS = ['Impressions', 'חשיפות']
const GSC_CTR_HEADERS = ['CTR', 'אחוז קליקים']
const GSC_POSITION_HEADERS = ['Position', 'מיקום ממוצע']

function parseDate(raw: string | undefined): string | undefined {
    if (!raw) return undefined
    const s = raw.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    return undefined
}

export const gscExportCsvMapper: Mapper = {
    name: 'gsc_export_csv',

    canHandle(sourceType, headers) {
        if (sourceType === 'gsc_export_csv') return true
        const lowered = headers.map(h => h.toLowerCase())
        return lowered.includes('position') && lowered.includes('ctr')
            && lowered.includes('impressions') && lowered.includes('clicks')
    },

    map(rows: Record<string, string>[], ctx: MapContext): MappedRow[] {
        if (rows.length === 0) return []
        const headers = Object.keys(rows[0])

        const hasQuery = headers.some(h => GSC_QUERY_HEADERS.includes(h))
        const hasPage = headers.some(h => GSC_PAGE_HEADERS.includes(h))

        const out: MappedRow[] = []
        for (const row of rows) {
            const query = pickColumn(row, GSC_QUERY_HEADERS) || ''
            const page = pickColumn(row, GSC_PAGE_HEADERS) || ''
            const country = pickColumn(row, GSC_COUNTRY_HEADERS) || ''
            const device = pickColumn(row, GSC_DEVICE_HEADERS) || ''
            const date = parseDate(pickColumn(row, GSC_DATE_HEADERS))

            const dataType: 'query' | 'page' | 'account' = hasQuery ? 'query'
                : hasPage ? 'page'
                    : 'account'
            const entityName = query || page || country || 'gsc_aggregate'

            const periodStart = date || ctx.classifier.dateRange?.start || new Date().toISOString().slice(0, 10)
            const periodEnd = date || ctx.classifier.dateRange?.end || periodStart
            const periodGrain = date ? 'day' : (ctx.classifier.dateRange ? 'custom' : 'lifetime')

            const impressions = parseLocaleNumber(pickColumn(row, GSC_IMPRESSIONS_HEADERS))
            const clicks = parseLocaleNumber(pickColumn(row, GSC_CLICKS_HEADERS))
            const position = parseLocaleNumber(pickColumn(row, GSC_POSITION_HEADERS))

            const dimensions: Record<string, string | number | boolean | null> = {}
            if (country) dimensions.country = country
            if (device) dimensions.device = device
            if (query) dimensions.query = query
            if (page) dimensions.page = page

            const periodDateLocal = periodGrain === 'day' ? periodStart : undefined

            out.push({
                sourceType: 'gsc_export_csv',
                sourceMode: 'upload',
                dataType,
                platform: 'gsc',
                entityId: entityName,
                entityName,
                periodStart,
                periodEnd,
                periodGrain,
                accountTz: 'Asia/Jerusalem',
                periodDateLocal,
                // GSC = organic, no conversion attribution.
                impressions,
                clicks,
                position,
                dimensions,
                raw: { ...row },
            })
        }
        return out
    },
}