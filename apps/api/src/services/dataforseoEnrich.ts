// DataForSEO enrichment service for Mazhir audit + media plan.
//
// Pulls real keyword search volumes, CPC, competition for a list of seed
// keywords. Uses Google Ads Keyword Planner data via DataForSEO Labs API.
//
// Auth: client's own DataForSEO credentials (stored in instances.dataforseoKey
// as "login:password" — pay-per-use on their account, not Flowmatic's).
//
// Usage from Mazhir prompts:
//   const enrichment = await enrichKeywordsWithDFS(instanceId, seedKeywords)
//   prompt += renderDFSContext(enrichment)

interface DFSKeyword {
    keyword: string
    searchVolume: number
    cpc: number                     // ILS (or USD if location not IL — we filter)
    competition: number             // 0-1
    competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null
    monthlyTrend?: number           // YoY %
}

interface DFSResult {
    available: boolean
    reason?: string
    keywords: DFSKeyword[]
    totalQueries: number
    locationCode: number
    languageCode: string
}

const ENDPOINT = 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live'
const IL_LOCATION_CODE = 2376       // Israel
const HE_LANGUAGE_CODE = 'he'

export async function enrichKeywordsWithDFS(
    dataforseoCredentials: string | null | undefined,
    seedKeywords: string[],
    options: { locationCode?: number; languageCode?: string } = {},
): Promise<DFSResult> {
    if (!dataforseoCredentials) {
        return { available: false, reason: 'DataForSEO not connected', keywords: [], totalQueries: 0, locationCode: 0, languageCode: '' }
    }
    if (seedKeywords.length === 0) {
        return { available: false, reason: 'No seed keywords', keywords: [], totalQueries: 0, locationCode: 0, languageCode: '' }
    }

    const locationCode = options.locationCode ?? IL_LOCATION_CODE
    const languageCode = options.languageCode ?? HE_LANGUAGE_CODE

    // Strip duplicates + normalize whitespace, cap at 100 (DFS limit)
    const cleaned = Array.from(new Set(seedKeywords.map(k => k.trim()).filter(k => k.length > 1))).slice(0, 100)
    if (cleaned.length === 0) {
        return { available: false, reason: 'No valid keywords after normalization', keywords: [], totalQueries: 0, locationCode, languageCode }
    }

    const auth = 'Basic ' + Buffer.from(dataforseoCredentials).toString('base64')
    // Google Ads search_volume endpoint REJECTS language_code/language_name
    // for many country pairs (including IL — verified 2026-04-29). Location-
    // only is the safe shape; results include CPC + competition correctly.
    const body = [{
        keywords: cleaned,
        location_code: locationCode,
        sort_by: 'search_volume',
    }]

    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(45_000),
        })
        const json = await res.json() as { tasks?: Array<{ result?: Array<{ keyword: string; search_volume: number | null; cpc: number | null; competition: number | null; competition_level: string | null; monthly_searches?: Array<{ year: number; month: number; search_volume: number }> }> }>; status_code?: number; status_message?: string }
        // DFS wraps task-level errors INSIDE tasks[0].status_code while
        // top-level status_code stays 20000 ("Ok."). Surface task-level error.
        const task = json.tasks?.[0]
        const taskStatus = (task as any)?.status_code
        const taskMsg = (task as any)?.status_message
        if (json.status_code !== 20000) {
            return { available: false, reason: `DFS API: ${json.status_message || json.status_code}`, keywords: [], totalQueries: cleaned.length, locationCode, languageCode }
        }
        if (taskStatus && taskStatus !== 20000) {
            return { available: false, reason: `DFS task error ${taskStatus}: ${taskMsg || 'unknown'}`, keywords: [], totalQueries: cleaned.length, locationCode, languageCode }
        }
        if (!task?.result) {
            return { available: false, reason: `DFS empty result (location_code=${locationCode})`, keywords: [], totalQueries: cleaned.length, locationCode, languageCode }
        }
        const result = task.result as NonNullable<typeof task.result>
        const keywords: DFSKeyword[] = result.map(r => {
            const trend = (() => {
                if (!r.monthly_searches || r.monthly_searches.length < 12) return undefined
                const sorted = r.monthly_searches.slice().sort((a, b) => (a.year - b.year) || (a.month - b.month))
                const recent = sorted.slice(-3).reduce((s, x) => s + x.search_volume, 0)
                const prior = sorted.slice(-15, -12).reduce((s, x) => s + x.search_volume, 0)
                if (prior === 0) return undefined
                return Math.round(((recent - prior) / prior) * 100)
            })()
            return {
                keyword: r.keyword,
                searchVolume: r.search_volume ?? 0,
                cpc: r.cpc ?? 0,
                competition: r.competition ?? 0,
                competitionLevel: (r.competition_level as DFSKeyword['competitionLevel']) ?? null,
                monthlyTrend: trend,
            }
        })
        return { available: true, keywords, totalQueries: cleaned.length, locationCode, languageCode }
    } catch (err) {
        return { available: false, reason: `DFS fetch failed: ${(err as Error).message}`, keywords: [], totalQueries: cleaned.length, locationCode, languageCode }
    }
}

// Render DFS data as a Markdown table for Opus prompts
export function renderDFSContext(r: DFSResult): string {
    if (!r.available || r.keywords.length === 0) {
        return `═══ DATAFORSEO KEYWORD DATA ═══\n\n(${r.reason || 'no data'})`
    }
    const top = r.keywords.slice(0, 50)        // Cap to keep prompt tight
    const lines = top.map(k => {
        const vol = k.searchVolume.toString().padStart(6)
        const cpc = k.cpc.toFixed(2).padStart(6)
        const comp = k.competitionLevel || '?'
        const trend = typeof k.monthlyTrend === 'number' ? (k.monthlyTrend >= 0 ? '+' : '') + k.monthlyTrend + '%' : ''
        return `  ${k.keyword.padEnd(40)} | vol=${vol} | cpc=₪${cpc} | comp=${comp.padEnd(6)} | yoy=${trend}`
    })
    return `═══ DATAFORSEO KEYWORD DATA (location=IL, lang=he) ═══

${r.keywords.length} keywords measured · top 50 by volume:

${lines.join('\n')}

USE THIS DATA when planning campaigns:
  - Pick keywords with vol > 50 AND cpc < (monthlyBudget / target_clicks)
  - Skip keywords with cpc > 0 AND vol = 0 (DFS noise)
  - Group by competition level — LOW = good for budget-constrained accounts
  - YoY trend > +30% = rising, prioritize. < -30% = declining, skip.`
}