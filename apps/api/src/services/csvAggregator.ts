/**
 * CSV Aggregator for client-uploaded historical reports.
 *
 * Replaces the "first 4000 chars" raw preview with real summary statistics,
 * so Mazhir sees aggregates over the FULL data instead of the first 14 days
 * of a 12-month CSV.
 *
 * Detects common Google Ads / GA4 export shapes by header sniffing:
 *   - Google Ads campaign/ad-group/keyword report
 *   - GA4 conversion / acquisition report
 *   - Generic "date,metric,value" tabular
 *
 * Outputs: row count, period span, totals (impressions/clicks/conversions/cost),
 * weekly time-series, top N rows by spend/conversions.
 */

export interface CsvAggregate {
    fileName: string
    rowCount: number
    columns: string[]
    period?: { startDate: string; endDate: string }
    detectedShape: 'google_ads_campaign' | 'google_ads_keyword' | 'google_ads_search_terms' | 'ga4_conversions' | 'ga4_acquisition' | 'generic_tabular' | 'unknown'
    totals?: {
        impressions?: number
        clicks?: number
        ctr?: number
        cost?: number
        conversions?: number
        costPerConversion?: number
        avgCpc?: number
    }
    timeSeries?: Array<{ period: string; clicks: number; cost: number; conv: number }>
    topByCost?: Array<{ name: string; cost: number; clicks: number; conv: number }>
    topByConversions?: Array<{ name: string; conv: number; clicks: number; cost: number }>
    notes: string[]
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
    // Tolerant CSV parser — handles quoted commas, but doesn't handle escaped
    // quotes-inside-quotes (rare in Google Ads exports). Good enough.
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
    if (lines.length < 2) return { headers: [], rows: [] }

    // Skip Google Ads "downloaded on" preamble — first 2-3 lines
    let headerIdx = 0
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const cells = splitCsvLine(lines[i])
        if (cells.length >= 3 && cells.some(c => /campaign|ad group|keyword|date|day|impressions|clicks|conversions/i.test(c))) {
            headerIdx = i
            break
        }
    }

    const headers = splitCsvLine(lines[headerIdx]).map(h => h.trim().replace(/^"|"$/g, ''))
    const rows: string[][] = []
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i])
        if (cells.length === headers.length || cells.length === headers.length - 1) {
            rows.push(cells)
        } else if (cells.length > 1 && i < lines.length - 5) {
            // tolerate, but stop on Google's "Total" footer rows
            if (cells[0] && /total|---/.test(cells[0])) continue
            rows.push(cells)
        }
    }
    return { headers, rows }
}

function splitCsvLine(line: string): string[] {
    const out: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') { inQ = !inQ; continue }
        if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue }
        cur += ch
    }
    out.push(cur)
    return out
}

function parseNumber(s: string): number {
    if (!s) return 0
    const cleaned = s.replace(/[^\d.\-]/g, '')
    const n = parseFloat(cleaned)
    return isNaN(n) ? 0 : n
}

function detectShape(headers: string[]): CsvAggregate['detectedShape'] {
    const h = headers.map(x => x.toLowerCase())
    if (h.includes('search term') || h.includes('search terms')) return 'google_ads_search_terms'
    if (h.includes('keyword')) return 'google_ads_keyword'
    if (h.includes('campaign') && (h.includes('impressions') || h.includes('clicks'))) return 'google_ads_campaign'
    if (h.some(x => x.includes('conversion'))) return 'ga4_conversions'
    if (h.includes('source') || h.includes('medium') || h.includes('session source')) return 'ga4_acquisition'
    if (h.includes('date') || h.includes('day')) return 'generic_tabular'
    return 'unknown'
}

function findCol(headers: string[], aliases: string[]): number {
    const h = headers.map(x => x.toLowerCase())
    for (const alias of aliases) {
        const idx = h.findIndex(c => c === alias.toLowerCase() || c.includes(alias.toLowerCase()))
        if (idx >= 0) return idx
    }
    return -1
}

export function aggregateCsv(fileName: string, text: string): CsvAggregate {
    const notes: string[] = []
    const { headers, rows } = parseCsv(text)
    if (headers.length === 0) {
        return { fileName, rowCount: 0, columns: [], detectedShape: 'unknown', notes: ['Could not parse — no rows'] }
    }
    if (rows.length === 0) {
        return { fileName, rowCount: 0, columns: headers, detectedShape: 'unknown', notes: ['Empty file or all rows filtered'] }
    }

    const shape = detectShape(headers)

    const dateCol = findCol(headers, ['date', 'day', 'week'])
    const nameCol = findCol(headers, ['campaign', 'ad group', 'keyword', 'search term', 'page'])
    const imprCol = findCol(headers, ['impressions', 'impr.', 'impr'])
    const clicksCol = findCol(headers, ['clicks'])
    const costCol = findCol(headers, ['cost', 'spend', 'amount'])
    const convCol = findCol(headers, ['conversions', 'conv.', 'all conv', 'lead'])

    let totalImpr = 0, totalClicks = 0, totalCost = 0, totalConv = 0
    const periodSet = new Set<string>()
    const weeklyMap = new Map<string, { clicks: number; cost: number; conv: number }>()
    const byNameMap = new Map<string, { cost: number; clicks: number; conv: number }>()

    for (const row of rows) {
        const impr = imprCol >= 0 ? parseNumber(row[imprCol]) : 0
        const clicks = clicksCol >= 0 ? parseNumber(row[clicksCol]) : 0
        const cost = costCol >= 0 ? parseNumber(row[costCol]) : 0
        const conv = convCol >= 0 ? parseNumber(row[convCol]) : 0
        totalImpr += impr
        totalClicks += clicks
        totalCost += cost
        totalConv += conv

        if (dateCol >= 0 && row[dateCol]) {
            const date = (row[dateCol] || '').slice(0, 10)
            periodSet.add(date)
            // Bucket to ISO week (yyyy-Www)
            const d = new Date(date)
            if (!isNaN(d.getTime())) {
                const yr = d.getUTCFullYear()
                const start = new Date(Date.UTC(yr, 0, 1))
                const wk = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getUTCDay() + 1) / 7)
                const key = `${yr}-W${String(wk).padStart(2, '0')}`
                const cur = weeklyMap.get(key) || { clicks: 0, cost: 0, conv: 0 }
                cur.clicks += clicks; cur.cost += cost; cur.conv += conv
                weeklyMap.set(key, cur)
            }
        }
        if (nameCol >= 0 && row[nameCol]) {
            const name = (row[nameCol] || '').slice(0, 80)
            const cur = byNameMap.get(name) || { cost: 0, clicks: 0, conv: 0 }
            cur.cost += cost; cur.clicks += clicks; cur.conv += conv
            byNameMap.set(name, cur)
        }
    }

    const dates = [...periodSet].sort()
    const period = dates.length > 0 ? { startDate: dates[0], endDate: dates[dates.length - 1] } : undefined
    const ctr = totalImpr > 0 ? Math.round((totalClicks / totalImpr) * 10000) / 100 : 0
    const avgCpc = totalClicks > 0 ? Math.round((totalCost / totalClicks) * 100) / 100 : 0
    const cpa = totalConv > 0 ? Math.round((totalCost / totalConv) * 100) / 100 : 0

    const timeSeries = [...weeklyMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-26)  // last 26 weeks
        .map(([period, v]) => ({ period, clicks: v.clicks, cost: Math.round(v.cost * 100) / 100, conv: Math.round(v.conv * 10) / 10 }))

    const topByCost = [...byNameMap.entries()]
        .sort((a, b) => b[1].cost - a[1].cost)
        .slice(0, 10)
        .map(([name, v]) => ({ name, cost: Math.round(v.cost * 100) / 100, clicks: v.clicks, conv: Math.round(v.conv * 10) / 10 }))

    const topByConversions = [...byNameMap.entries()]
        .filter(([, v]) => v.conv > 0)
        .sort((a, b) => b[1].conv - a[1].conv)
        .slice(0, 10)
        .map(([name, v]) => ({ name, conv: Math.round(v.conv * 10) / 10, clicks: v.clicks, cost: Math.round(v.cost * 100) / 100 }))

    if (totalConv === 0 && totalClicks > 100) {
        notes.push('CSV reports 0 conversions despite real clicks — likely no native pixel was installed during this period. Treat conversion count as UNRELIABLE; cross-check with GA4.')
    }
    if (period && (Date.parse(period.endDate) - Date.parse(period.startDate)) / 86400000 > 60 && rows.length < 30) {
        notes.push('Long period but few rows — may be aggregated, not daily')
    }

    return {
        fileName,
        rowCount: rows.length,
        columns: headers,
        period,
        detectedShape: shape,
        totals: {
            impressions: totalImpr,
            clicks: totalClicks,
            ctr,
            cost: Math.round(totalCost * 100) / 100,
            conversions: Math.round(totalConv * 10) / 10,
            costPerConversion: cpa,
            avgCpc,
        },
        timeSeries: timeSeries.length > 0 ? timeSeries : undefined,
        topByCost: topByCost.length > 0 ? topByCost : undefined,
        topByConversions: topByConversions.length > 0 ? topByConversions : undefined,
        notes,
    }
}

export function aggregateAllCsvs(reports: Array<{ name: string; type: string; base64: string }>): CsvAggregate[] {
    const out: CsvAggregate[] = []
    for (const r of reports) {
        if (r.type !== 'text/csv' && !r.name.toLowerCase().endsWith('.csv')) continue
        try {
            const text = Buffer.from(r.base64, 'base64').toString('utf-8')
            out.push(aggregateCsv(r.name, text))
        } catch (err) {
            out.push({ fileName: r.name, rowCount: 0, columns: [], detectedShape: 'unknown', notes: [`Parse error: ${(err as Error).message}`] })
        }
    }
    return out
}

export function renderCsvAggregateContext(aggs: CsvAggregate[]): string {
    if (aggs.length === 0) return '═══ UPLOADED CSV REPORTS ═══\n\n(none)'
    return aggs.map(a => {
        const t = a.totals
        const totalsLine = t
            ? `  Impressions: ${(t.impressions || 0).toLocaleString()}  ·  Clicks: ${(t.clicks || 0).toLocaleString()}  ·  CTR: ${t.ctr}%
  Cost: ₪${(t.cost || 0).toLocaleString()}  ·  Avg CPC: ₪${t.avgCpc}  ·  Conversions: ${t.conversions}  ·  CPA: ₪${t.costPerConversion}`
            : '  (no metric columns detected)'
        const ts = a.timeSeries ? '\n\nWeekly trend (last 26w):\n' + a.timeSeries.slice(-12).map(w => `  ${w.period}: clicks=${w.clicks}, cost=₪${w.cost}, conv=${w.conv}`).join('\n') : ''
        const top = a.topByCost ? '\n\nTop by cost:\n' + a.topByCost.slice(0, 5).map(x => `  ${x.name.padEnd(40)} ₪${x.cost}, ${x.clicks} clicks, ${x.conv} conv`).join('\n') : ''
        const conv = a.topByConversions ? '\n\nTop by conversions:\n' + a.topByConversions.slice(0, 5).map(x => `  ${x.name.padEnd(40)} ${x.conv} conv, ${x.clicks} clicks, ₪${x.cost}`).join('\n') : ''
        const notes = a.notes.length ? '\n\nNotes:\n' + a.notes.map(n => `  · ${n}`).join('\n') : ''
        return `═══ ${a.fileName} (${a.detectedShape}, ${a.rowCount} rows${a.period ? ', ' + a.period.startDate + ' → ' + a.period.endDate : ''}) ═══

${totalsLine}${ts}${top}${conv}${notes}`
    }).join('\n\n')
}
