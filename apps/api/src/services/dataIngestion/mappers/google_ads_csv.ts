/**
 * Google Ads CSV exporter mapper.
 *
 * Handles the standard "Download" → CSV from the Campaigns / Ad groups /
 * Keywords / Search Terms reports. Headers vary by view; we treat any of
 * those as "campaign-ish rows" and use the most specific entity column
 * present to set dataType.
 *
 * Currency: usually the account currency. Header sometimes spells it out
 * ("Cost (ILS)" / "עלות (ILS)"). Falls back to ILS (IL accounts default).
 */

import { pickColumn, parseLocaleNumber } from '../csvParser'
import type { Mapper, MappedRow, MapContext, AttributionWindow, AttributionModel } from '../types'

// Google Ads defaults: 30-day click window, data-driven model (Google's
// default since 2023 — pre-2023 was "last click"). User-changed attribution
// would surface as a "Conversion action" column with custom settings; for
// account-level exports we go with the default.
const GOOG_DEFAULT_ATTRIBUTION_WINDOW: AttributionWindow = '30d_click'
const GOOG_DEFAULT_ATTRIBUTION_MODEL: AttributionModel = 'data_driven'
const GOOG_DEFAULT_TZ = 'Asia/Jerusalem'

const GOOG_CONV_ACTION_HEADERS = ['Conversion action', 'Conv. action', 'פעולת המרה']
const GOOG_ATTRIBUTION_MODEL_HEADERS = ['Attribution model', 'מודל ייחוס']

const GOOG_CAMPAIGN_HEADERS = ['Campaign', 'קמפיין', 'שם הקמפיין']
const GOOG_ADGROUP_HEADERS = ['Ad group', 'קבוצת מודעות']
const GOOG_KEYWORD_HEADERS = ['Keyword', 'Search keyword', 'מילת מפתח']
const GOOG_SEARCH_TERM_HEADERS = ['Search term', 'מונח חיפוש']
const GOOG_DATE_HEADERS = ['Day', 'Date', 'תאריך', 'יום']

const GOOG_IMPRESSIONS_HEADERS = ['Impr.', 'Impressions', 'חשיפות']
const GOOG_CLICKS_HEADERS = ['Clicks', 'קליקים']
const GOOG_COST_HEADERS = [
    'Cost', 'Cost (ILS)', 'Cost (USD)', 'עלות', 'עלות (ILS)', 'עלות (USD)',
]
const GOOG_CONV_HEADERS = ['Conversions', 'Conv.', 'המרות']
const GOOG_CONV_VALUE_HEADERS = [
    'Conv. value', 'Conversion value', 'ערך ההמרה', 'ערך המרות',
]
const GOOG_CTR_HEADERS = ['CTR', 'אחוז קליקים']
const GOOG_AVG_CPC_HEADERS = ['Avg. CPC', 'ממוצע CPC']

const GOOG_DEVICE_HEADERS = ['Device', 'מכשיר']
const GOOG_NETWORK_HEADERS = ['Network', 'רשת']
const GOOG_MATCH_TYPE_HEADERS = ['Match type', 'סוג התאמה']

function inferCurrencyFromCostHeader(headers: string[]): string {
    const m = headers.find(h => /\(([A-Z]{3})\)/.test(h) && /cost|עלות/i.test(h))
    if (m) {
        const cur = m.match(/\(([A-Z]{3})\)/)?.[1]
        if (cur) return cur.toUpperCase()
    }
    return 'ILS'
}

function isTotalRow(row: Record<string, string>): boolean {
    const v = Object.values(row).find(x => typeof x === 'string' && x.trim().length > 0)
    if (!v) return false
    return /^(Total|סה"?כ|סה״כ|---)/i.test(v.trim())
}

function parseDate(raw: string | undefined): string | undefined {
    if (!raw) return undefined
    const s = raw.trim()
    if (!s) return undefined
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
    if (m) {
        const [, d, mo, y] = m
        const yyyy = y.length === 2 ? `20${y}` : y
        return `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return undefined
}

export const googleAdsCsvMapper: Mapper = {
    name: 'google_ads_csv',

    canHandle(sourceType, headers) {
        if (sourceType === 'google_ads_csv') return true
        const lowered = headers.map(h => h.toLowerCase())
        const hasGoogTell = lowered.some(h =>
            h === 'campaign' || h === 'impr.' || h.includes('avg. cpc') || h.includes('conv.'),
        )
        return hasGoogTell
    },

    map(rows: Record<string, string>[], ctx: MapContext): MappedRow[] {
        if (rows.length === 0) return []
        const headers = Object.keys(rows[0])
        const inferredCurrency = ctx.classifier.currency || inferCurrencyFromCostHeader(headers)

        const hasKeyword = headers.some(h => GOOG_KEYWORD_HEADERS.includes(h))
        const hasSearchTerm = headers.some(h => GOOG_SEARCH_TERM_HEADERS.includes(h))
        const hasAdGroup = headers.some(h => GOOG_ADGROUP_HEADERS.includes(h))

        const dataType: 'campaign' | 'adset' | 'keyword' | 'search_term' =
            hasSearchTerm ? 'search_term'
                : hasKeyword ? 'keyword'
                    : hasAdGroup ? 'adset'
                        : 'campaign'

        const out: MappedRow[] = []

        for (const row of rows) {
            if (isTotalRow(row)) continue

            const campaign = pickColumn(row, GOOG_CAMPAIGN_HEADERS) || ''
            const adGroup = pickColumn(row, GOOG_ADGROUP_HEADERS) || ''
            const keyword = pickColumn(row, GOOG_KEYWORD_HEADERS) || ''
            const searchTerm = pickColumn(row, GOOG_SEARCH_TERM_HEADERS) || ''

            const entityName = dataType === 'search_term' ? searchTerm
                : dataType === 'keyword' ? keyword
                    : dataType === 'adset' ? adGroup
                        : campaign
            if (!entityName) continue

            const date = parseDate(pickColumn(row, GOOG_DATE_HEADERS))
            const periodStart = date || ctx.classifier.dateRange?.start || new Date().toISOString().slice(0, 10)
            const periodEnd = date || ctx.classifier.dateRange?.end || periodStart
            const periodGrain = date ? 'day' : (ctx.classifier.dateRange ? 'custom' : 'lifetime')

            const impressions = parseLocaleNumber(pickColumn(row, GOOG_IMPRESSIONS_HEADERS))
            const clicks = parseLocaleNumber(pickColumn(row, GOOG_CLICKS_HEADERS))
            const spend = parseLocaleNumber(pickColumn(row, GOOG_COST_HEADERS))
            const conversions = parseLocaleNumber(pickColumn(row, GOOG_CONV_HEADERS))
            const conversionValue = parseLocaleNumber(pickColumn(row, GOOG_CONV_VALUE_HEADERS))

            const device = pickColumn(row, GOOG_DEVICE_HEADERS)
            const network = pickColumn(row, GOOG_NETWORK_HEADERS)
            const matchType = pickColumn(row, GOOG_MATCH_TYPE_HEADERS)

            const dimensions: Record<string, string | number | boolean | null> = {}
            if (campaign) dimensions.campaign_name = campaign
            if (adGroup) dimensions.adgroup_name = adGroup
            if (device) dimensions.device = device
            if (network) dimensions.network = network
            if (matchType) dimensions.match_type = matchType

            const entityId =
                pickColumn(row, ['Campaign ID', 'Ad group ID', 'Keyword ID', 'מזהה הקמפיין', 'מזהה קבוצת מודעות'])
                || entityName

            const convAction = pickColumn(row, GOOG_CONV_ACTION_HEADERS)
            const attrModelRaw = pickColumn(row, GOOG_ATTRIBUTION_MODEL_HEADERS)?.toLowerCase() || ''
            const attributionModel: AttributionModel =
                attrModelRaw.includes('data') || attrModelRaw.includes('driven') ? 'data_driven'
                    : attrModelRaw.includes('first') ? 'first_click'
                        : attrModelRaw.includes('linear') ? 'linear'
                            : attrModelRaw.includes('time') ? 'time_decay'
                                : attrModelRaw.includes('position') ? 'position_based'
                                    : attrModelRaw.includes('last') ? 'last_click'
                                        : GOOG_DEFAULT_ATTRIBUTION_MODEL

            const periodDateLocal = periodGrain === 'day' ? periodStart : undefined

            out.push({
                sourceType: 'google_ads_csv',
                sourceMode: 'upload',
                dataType,
                platform: 'google_ads',
                entityId,
                entityName,
                periodStart,
                periodEnd,
                periodGrain,
                accountTz: GOOG_DEFAULT_TZ,
                periodDateLocal,
                attributionWindow: GOOG_DEFAULT_ATTRIBUTION_WINDOW,
                attributionModel,
                conversionEventName: convAction || 'all',
                impressions,
                clicks,
                spend,
                sourceCurrency: inferredCurrency,
                conversions,
                conversionValue,
                dimensions,
                raw: { ...row },
            })
        }

        return out
    },
}