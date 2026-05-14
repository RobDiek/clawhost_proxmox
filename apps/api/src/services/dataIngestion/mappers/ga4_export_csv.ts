/**
 * GA4 export CSV mapper. The "Reports" → "Share" → "Download CSV" flow.
 * The actual columns depend on which report was exported: Acquisition, Traffic,
 * Events, etc. We treat each row as an `event`-grain data point and stash
 * everything else in dimensions for the analyst layer to slice.
 *
 * GA4 cost: no money columns (GA4 doesn't surface spend) — only revenue if
 * ecommerce is wired. We map revenue → conversionValue, conversions → conversions.
 */

import { pickColumn, parseLocaleNumber } from '../csvParser'
import type { Mapper, MappedRow, MapContext } from '../types'

// GA4 default attribution since 2023: data-driven on a 30-day click + 1-day
// view window. User can change in Admin → Attribution settings, but the
// export doesn't surface the setting — we assume default.

const GA4_DATE_HEADERS = ['Date', 'תאריך', 'יום']
const GA4_EVENT_NAME_HEADERS = ['Event name', 'שם האירוע']
const GA4_USERS_HEADERS = ['Active users', 'Users', 'משתמשים', 'משתמשים פעילים']
const GA4_SESSIONS_HEADERS = ['Sessions', 'Engaged sessions', 'סשנים']
const GA4_EVENT_COUNT_HEADERS = ['Event count', 'מספר אירועים']
const GA4_CONVERSIONS_HEADERS = ['Conversions', 'Key events', 'המרות']
const GA4_REVENUE_HEADERS = ['Total revenue', 'Revenue', 'הכנסה', 'סך ההכנסות']
const GA4_SOURCE_MEDIUM_HEADERS = ['Session source / medium', 'Source / medium', 'מקור / מדיה']
const GA4_CAMPAIGN_HEADERS = ['Session campaign', 'Campaign', 'קמפיין']
const GA4_PAGE_PATH_HEADERS = ['Page path', 'Page path and screen class', 'נתיב הדף']
const GA4_LANDING_PAGE_HEADERS = ['Landing page', 'דף נחיתה']

function parseDate(raw: string | undefined): string | undefined {
    if (!raw) return undefined
    const s = raw.trim()
    if (/^\d{4}-?\d{2}-?\d{2}$/.test(s)) {
        // GA4 sometimes exports YYYYMMDD without separators
        const compact = s.replace(/-/g, '')
        return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
    }
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
    if (m) {
        const [, d, mo, y] = m
        const yyyy = y.length === 2 ? `20${y}` : y
        return `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return undefined
}

export const ga4ExportCsvMapper: Mapper = {
    name: 'ga4_export_csv',

    canHandle(sourceType, headers) {
        if (sourceType === 'ga4_export_csv') return true
        const lowered = headers.map(h => h.toLowerCase())
        return lowered.some(h =>
            h === 'active users' || h === 'event count' || h === 'session source / medium'
            || h === 'engaged sessions',
        )
    },

    map(rows: Record<string, string>[], ctx: MapContext): MappedRow[] {
        if (rows.length === 0) return []

        const out: MappedRow[] = []
        for (const row of rows) {
            const eventName = pickColumn(row, GA4_EVENT_NAME_HEADERS) || ''
            const pagePath = pickColumn(row, GA4_PAGE_PATH_HEADERS) || pickColumn(row, GA4_LANDING_PAGE_HEADERS) || ''
            const sourceMedium = pickColumn(row, GA4_SOURCE_MEDIUM_HEADERS) || ''
            const campaign = pickColumn(row, GA4_CAMPAIGN_HEADERS) || ''

            // dataType decision:
            //   event-name column present → 'event'
            //   page path column present → 'page'
            //   else → 'account'
            const dataType: 'event' | 'page' | 'account' = eventName ? 'event'
                : pagePath ? 'page'
                    : 'account'

            const entityName = eventName || pagePath || sourceMedium || campaign || 'ga4_aggregate'
            const date = parseDate(pickColumn(row, GA4_DATE_HEADERS))

            const periodStart = date || ctx.classifier.dateRange?.start || new Date().toISOString().slice(0, 10)
            const periodEnd = date || ctx.classifier.dateRange?.end || periodStart
            const periodGrain = date ? 'day' : (ctx.classifier.dateRange ? 'custom' : 'lifetime')

            const conversions = parseLocaleNumber(pickColumn(row, GA4_CONVERSIONS_HEADERS))
            const revenue = parseLocaleNumber(pickColumn(row, GA4_REVENUE_HEADERS))
            const sessions = parseLocaleNumber(pickColumn(row, GA4_SESSIONS_HEADERS))
            const eventCount = parseLocaleNumber(pickColumn(row, GA4_EVENT_COUNT_HEADERS))
            const users = parseLocaleNumber(pickColumn(row, GA4_USERS_HEADERS))

            const dimensions: Record<string, string | number | boolean | null> = {}
            if (sourceMedium) dimensions.source_medium = sourceMedium
            if (campaign) dimensions.campaign = campaign
            if (pagePath) dimensions.page_path = pagePath
            if (eventName) dimensions.event_name = eventName
            if (sessions !== undefined) dimensions.sessions = sessions
            if (eventCount !== undefined) dimensions.event_count = eventCount
            if (users !== undefined) dimensions.users = users

            const periodDateLocal = periodGrain === 'day' ? periodStart : undefined

            out.push({
                sourceType: 'ga4_export_csv',
                sourceMode: 'upload',
                dataType,
                platform: 'ga4',
                entityId: entityName,
                entityName,
                periodStart,
                periodEnd,
                periodGrain,
                accountTz: 'Asia/Jerusalem',
                periodDateLocal,
                attributionWindow: '30d_click_1d_view',
                attributionModel: 'data_driven',
                // For event-grain rows the event itself IS the conversion event;
                // for page/account aggregates we don't know which event so 'all'.
                conversionEventName: eventName || 'all',
                conversions,
                conversionValue: revenue,
                sourceCurrency: ctx.classifier.currency || 'ILS',
                dimensions,
                raw: { ...row },
            })
        }
        return out
    },
}