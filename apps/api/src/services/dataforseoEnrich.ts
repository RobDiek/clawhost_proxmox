// DataForSEO enrichment service for Mazhir audit + media plan.
//
// Pulls real keyword search volumes, CPC, competition for a list of seed
// keywords. Uses Google Ads Keyword Planner data via DataForSEO Labs API.
//
// Auth/billing: routed through the metered DFS proxy (`dfsPost`) — proxy-mode
// tenants use Flowmatic's master DFS account with a per-tenant balance gate +
// exact-cost ledger debit; the `dfsUseProxy=false` escape hatch uses the
// tenant's own `instances.dataforseoKey`. This module no longer reads the raw
// key directly (that bypassed metering — P3 sovereignty fix 2026-06-11).
//
// Usage from Mazhir prompts:
//   const enrichment = await enrichKeywordsWithDFS(instanceId, seedKeywords)
//   prompt += renderDFSContext(enrichment)
import { dfsPost, DfsError } from '@/services/research/dataforseo/client'

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

const IL_LOCATION_CODE = 2376       // Israel
const HE_LANGUAGE_CODE = 'he'

// DFS task result shape for keywords_data/google_ads/search_volume/live
interface DFSVolumeRow {
    keyword: string
    search_volume: number | null
    cpc: number | null
    competition: number | null
    competition_level: string | null
    monthly_searches?: Array<{ year: number; month: number; search_volume: number }>
}

export async function enrichKeywordsWithDFS(
    instanceId: string,
    seedKeywords: string[],
    options: { locationCode?: number; languageCode?: string } = {},
): Promise<DFSResult> {
    if (!instanceId) {
        return { available: false, reason: 'No instance', keywords: [], totalQueries: 0, locationCode: 0, languageCode: '' }
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

    // Google Ads search_volume endpoint REJECTS language_code/language_name
    // for many country pairs (including IL — verified 2026-04-29). Location-
    // only is the safe shape; results include CPC + competition correctly.
    const body = [{
        keywords: cleaned,
        location_code: locationCode,
        sort_by: 'search_volume',
    }]

    try {
        // Metered proxy: dfsPost handles proxy-vs-legacy auth, the balance gate,
        // top-/task-level DFS error mapping (throws DfsError), and the per-tenant
        // ledger debit. We never touch the raw key here.
        const { result } = await dfsPost<DFSVolumeRow>(
            instanceId,
            'keywords_data/google_ads/search_volume/live',
            body,
            45_000,
        )
        if (!result || result.length === 0) {
            return { available: false, reason: `DFS empty result (location_code=${locationCode})`, keywords: [], totalQueries: cleaned.length, locationCode, languageCode }
        }
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
        if (err instanceof DfsError) {
            return { available: false, reason: err.userMessage || `DFS error: ${err.kind}`, keywords: [], totalQueries: cleaned.length, locationCode, languageCode }
        }
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