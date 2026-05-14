/**
 * Meta Ads (Facebook + Instagram) CSV exporter mapper.
 *
 * Handles the standard Ads Manager export in both:
 *   - English UI (default) — headers like "Campaign name", "Impressions"
 *   - Hebrew UI            — headers like "שם הקמפיין", "צפיות"
 *
 * Granularity rules:
 *   - If "Reporting starts" + "Reporting ends" columns exist → per-day rows
 *     and periodGrain='day' when start===end, otherwise periodGrain='custom'.
 *   - If only "Time period" is reported (e.g. "Last 30 days") → one row per
 *     campaign with periodGrain='lifetime' and periodStart/End spanning the
 *     classifier-detected date range (if any).
 *   - Hebrew "Total:" row at the bottom is silently skipped.
 *
 * The "results" column in Meta is conversion-mechanism-specific (link clicks,
 * messaging conversations, page likes, leads...). We map it to `conversions`
 * and stash the result-type label in dimensions.result_type so downstream
 * analysis can disambiguate.
 */

import { pickColumn, parseLocaleNumber } from '../csvParser'
import type { Mapper, MappedRow, MapContext, AttributionWindow, AttributionModel } from '../types'

// Meta defaults since 2021 (post-iOS-14 ATT): 7-day click + 1-day view.
// User can change in Ads Manager but it's not exported in the CSV columns —
// we assume default unless an "Attribution setting" column is present.
const META_DEFAULT_ATTRIBUTION_WINDOW: AttributionWindow = '7d_click_1d_view'
const META_DEFAULT_ATTRIBUTION_MODEL: AttributionModel = 'last_click'
const META_DEFAULT_TZ = 'Asia/Jerusalem'   // IL accounts; mappers can override via context

const META_CAMPAIGN_HEADERS = [
    'Campaign name', 'שם הקמפיין', 'שם קמפיין', 'Campaign',
]
const META_ADSET_HEADERS = [
    'Ad set name', 'שם סדרת מודעות', 'Ad Set Name',
]
const META_AD_HEADERS = [
    'Ad name', 'שם המודעה', 'שם מודעה',
]
const META_IMPRESSIONS_HEADERS = [
    'Impressions', 'צפיות', 'הופעות',
]
const META_REACH_HEADERS = [
    'Reach', 'הגעה', 'חשיפה',
]
const META_LINK_CLICKS_HEADERS = [
    'Link clicks', 'קליקים על הקישור', 'קליקים על קישור', 'Link Clicks',
]
const META_CLICKS_ALL_HEADERS = [
    'Clicks (all)', 'Clicks', 'קליקים', 'כל הקליקים',
]
const META_SPEND_HEADERS = [
    'Amount spent (ILS)', 'Amount spent (USD)', 'Amount spent (EUR)',
    'Amount spent', 'סכום שהוצא (ILS)', 'סכום שהוצא', 'הוצאה',
]
const META_RESULTS_HEADERS = [
    'Results', 'תוצאות',
]
const META_RESULT_TYPE_HEADERS = [
    'Result indicator', 'Result type', 'סוג התוצאה', 'אינדיקטור התוצאה',
]
const META_FREQUENCY_HEADERS = ['Frequency', 'תדירות']
const META_VIDEO_VIEWS_HEADERS = [
    'Video plays', 'Video views (3-second)', 'Video plays at 3s',
    'צפיות בסרטון', 'הפעלות וידאו',
]
const META_PURCHASE_VALUE_HEADERS = [
    'Purchase ROAS (return on ad spend)',  // sometimes ROAS instead of value
    'Purchases conversion value',
    'ערך המרת רכישה', 'ערך הרכישה', 'ערך כספי של רכישות',
]
const META_DATE_START_HEADERS = ['Reporting starts', 'תקופת הדיווח: התחלה', 'הדיווח: התחלה']
const META_DATE_END_HEADERS = ['Reporting ends', 'תקופת הדיווח: סיום', 'הדיווח: סיום']

const META_PLACEMENT_HEADERS = ['Placement', 'מיקום']
const META_DEVICE_HEADERS = ['Device platform', 'Device', 'פלטפורמת מכשיר']
const META_OBJECTIVE_HEADERS = ['Objective', 'Campaign objective', 'מטרת הקמפיין']
const META_ATTRIBUTION_SETTING_HEADERS = ['Attribution setting', 'הגדרת ייחוס']

// Map Meta's result_indicator string to the canonical conversion_event_name.
// Meta's strings: 'messaging_conversation_started_7d', 'actions:lead',
// 'actions:purchase', 'offsite_conversion.fb_pixel_purchase',
// 'actions:onsite_conversion.messaging_first_reply', etc.
function normalizeMetaResultType(raw: string | undefined): string {
    if (!raw) return 'all'
    const s = raw.toLowerCase().trim()
    if (s.includes('messaging_conversation')) return 'messaging_conversation_started'
    if (s.includes('messaging_first_reply')) return 'messaging_first_reply'
    if (s.includes('purchase')) return 'purchase'
    if (s.includes('lead')) return 'lead'
    if (s.includes('add_to_cart') || s.includes('addtocart')) return 'add_to_cart'
    if (s.includes('initiate_checkout') || s.includes('initiatecheckout')) return 'initiate_checkout'
    if (s.includes('complete_registration')) return 'complete_registration'
    if (s.includes('view_content') || s.includes('viewcontent')) return 'view_content'
    if (s.includes('link_click')) return 'link_click'
    if (s.includes('post_engagement')) return 'post_engagement'
    if (s.includes('page_like') || s.includes('page_engagement')) return 'page_engagement'
    if (s.includes('video_view')) return 'video_view'
    if (s.includes('app_install')) return 'app_install'
    if (s.includes('reach')) return 'reach'
    if (s.includes('impression')) return 'impression'
    // Unknown — keep the raw label so the analyst layer can see it
    return s.replace(/[^a-z0-9_]/g, '_').slice(0, 64) || 'unknown'
}

// Parse Meta's "Attribution setting" column if present. Examples:
//   "7-day click or 1-day view" → '7d_click_1d_view'
//   "1-day view"                → '1d_view'
//   "7-day click"               → '7d_click'
function parseMetaAttribution(raw: string | undefined): AttributionWindow {
    if (!raw) return META_DEFAULT_ATTRIBUTION_WINDOW
    const s = raw.toLowerCase()
    const has7dc = /7[\s-]?day click/.test(s) || /7d[\s_]?click/.test(s)
    const has1dv = /1[\s-]?day view/.test(s) || /1d[\s_]?view/.test(s)
    const has28dc = /28[\s-]?day click/.test(s) || /28d[\s_]?click/.test(s)
    if (has28dc && has1dv) return '28d_click_1d_view'
    if (has28dc) return '28d_click'
    if (has7dc && has1dv) return '7d_click_1d_view'
    if (has7dc) return '7d_click'
    if (has1dv) return '1d_view'
    return META_DEFAULT_ATTRIBUTION_WINDOW
}

// ─── Currency detection from header label ───────────────────────────────
function inferCurrencyFromSpendHeader(headers: string[]): string {
    const m = headers.find(h => /Amount spent \(([A-Z]{3})\)/i.test(h))
    if (m) {
        const cur = m.match(/\(([A-Z]{3})\)/)?.[1]
        if (cur) return cur.toUpperCase()
    }
    if (headers.some(h => /סכום שהוצא \(ILS\)|הוצאה.*₪|₪/.test(h))) return 'ILS'
    return 'ILS'   // IL accounts default to ILS
}

// ─── Hebrew "Total:" row sniffer ────────────────────────────────────────
function isTotalRow(row: Record<string, string>): boolean {
    const v = Object.values(row).find(x => typeof x === 'string' && x.trim().length > 0)
    if (!v) return false
    return /^(סה"?כ|סה״כ|total|grand total)/i.test(v.trim())
}

// ─── ISO date parser; handles DD/MM/YYYY (IL) and YYYY-MM-DD ────────────
function parseDate(raw: string | undefined): string | undefined {
    if (!raw) return undefined
    const s = raw.trim()
    if (!s) return undefined
    // Try ISO first
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    // DD/MM/YYYY or DD.MM.YYYY (IL formats)
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
    if (m) {
        const [, d, mo, y] = m
        const yyyy = y.length === 2 ? `20${y}` : y
        return `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return undefined
}

export const metaAdsCsvMapper: Mapper = {
    name: 'meta_ads_csv',

    canHandle(sourceType, headers) {
        if (sourceType === 'meta_ads_csv') return true
        // Fallback: heuristic header sniffing
        const lowered = headers.map(h => h.toLowerCase())
        const hasMetaTell = lowered.some(h =>
            h.includes('amount spent') || h.includes('reach') || h.includes('result indicator')
            || h.includes('סכום שהוצא') || h.includes('אינדיקטור התוצאה') || h.includes('שם הקמפיין'),
        )
        return hasMetaTell
    },

    map(rows: Record<string, string>[], ctx: MapContext): MappedRow[] {
        if (rows.length === 0) return []
        const headers = Object.keys(rows[0])
        const inferredCurrency = ctx.classifier.currency || inferCurrencyFromSpendHeader(headers)

        const out: MappedRow[] = []

        // Detect granularity: per-row dataType is the most specific entity present
        const hasAdName = headers.some(h => META_AD_HEADERS.includes(h))
        const hasAdsetName = headers.some(h => META_ADSET_HEADERS.includes(h))
        const dataType: 'ad' | 'adset' | 'campaign' = hasAdName ? 'ad'
            : hasAdsetName ? 'adset'
                : 'campaign'

        for (const row of rows) {
            if (isTotalRow(row)) continue

            const entityName = pickColumn(row,
                dataType === 'ad' ? META_AD_HEADERS
                    : dataType === 'adset' ? META_ADSET_HEADERS
                        : META_CAMPAIGN_HEADERS,
            ) || ''
            if (!entityName) continue

            const campaignName = pickColumn(row, META_CAMPAIGN_HEADERS) || entityName

            const impressions = parseLocaleNumber(pickColumn(row, META_IMPRESSIONS_HEADERS))
            const reach = parseLocaleNumber(pickColumn(row, META_REACH_HEADERS))
            const linkClicks = parseLocaleNumber(pickColumn(row, META_LINK_CLICKS_HEADERS))
            const allClicks = parseLocaleNumber(pickColumn(row, META_CLICKS_ALL_HEADERS))
            const clicks = linkClicks ?? allClicks   // prefer link clicks for paid performance analysis
            const spend = parseLocaleNumber(pickColumn(row, META_SPEND_HEADERS))
            const results = parseLocaleNumber(pickColumn(row, META_RESULTS_HEADERS))
            const resultType = pickColumn(row, META_RESULT_TYPE_HEADERS)
            const frequency = parseLocaleNumber(pickColumn(row, META_FREQUENCY_HEADERS))
            const videoViews = parseLocaleNumber(pickColumn(row, META_VIDEO_VIEWS_HEADERS))
            const purchaseValue = parseLocaleNumber(pickColumn(row, META_PURCHASE_VALUE_HEADERS))

            const dateStart = parseDate(pickColumn(row, META_DATE_START_HEADERS))
                || ctx.classifier.dateRange?.start
                || new Date().toISOString().slice(0, 10)
            const dateEnd = parseDate(pickColumn(row, META_DATE_END_HEADERS))
                || ctx.classifier.dateRange?.end
                || dateStart

            const placement = pickColumn(row, META_PLACEMENT_HEADERS)
            const device = pickColumn(row, META_DEVICE_HEADERS)
            const objective = pickColumn(row, META_OBJECTIVE_HEADERS)

            const dimensions: Record<string, string | number | boolean | null> = {
                campaign_name: campaignName,
            }
            if (placement) dimensions.placement = placement
            if (device) dimensions.device = device
            if (objective) dimensions.objective = objective
            if (resultType) dimensions.result_type = resultType

            // Entity id: prefer real ad/adset/campaign id columns if present;
            // fallback to the name (mappers must produce deterministic ids so
            // dedup works on re-uploaded files).
            const entityId =
                pickColumn(row, ['Ad ID', 'Ad Set ID', 'Campaign ID', 'מזהה מודעה', 'מזהה סדרת מודעות', 'מזהה הקמפיין'])
                || entityName

            const periodGrain = dateStart === dateEnd ? 'day' : 'custom'

            // Attribution window: prefer source column if present, else Meta default.
            const attrRaw = pickColumn(row, META_ATTRIBUTION_SETTING_HEADERS)
            const attributionWindow = parseMetaAttribution(attrRaw)
            const conversionEventName = normalizeMetaResultType(resultType)

            // period_date_local: only for single-day rows. Multi-day customs
            // stay null so aggregator falls back to prorate-by-overlap.
            const periodDateLocal = periodGrain === 'day' ? dateStart : undefined

            out.push({
                sourceType: 'meta_ads_csv',
                sourceMode: 'upload',
                dataType,
                platform: 'meta',
                entityId,
                entityName,
                periodStart: dateStart,
                periodEnd: dateEnd,
                periodGrain,
                accountTz: META_DEFAULT_TZ,
                periodDateLocal,
                attributionWindow,
                attributionModel: META_DEFAULT_ATTRIBUTION_MODEL,
                conversionEventName,
                impressions,
                clicks,
                spend,
                sourceCurrency: inferredCurrency,
                conversions: results,
                conversionValue: purchaseValue,
                videoViews,
                reach,
                frequency,
                dimensions,
                raw: { ...row },
            })
        }

        return out
    },
}