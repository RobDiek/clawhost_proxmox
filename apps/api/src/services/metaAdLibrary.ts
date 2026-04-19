/**
 * Meta Ad Library scraper — pulls active competitor ads for reference mining.
 *
 * Uses Meta Graph API /ads_archive endpoint:
 *   https://graph.facebook.com/v20.0/ads_archive
 *
 * Requires: user's Meta access token with `ads_read` scope (part of standard
 * Meta OAuth flow we already have). NO special approval needed for commercial
 * (non-political) ads — only political/social-issue ads require extra perms.
 *
 * Use cases:
 *   1. Given a competitor's Facebook Page ID → fetch their recent active ads
 *   2. Given search terms → find ads running in Israel matching the term
 *   3. Returns normalized shape consumable by Creative DNA decomposer (Phase B3.2)
 *
 * Rate limiting: Meta allows ~200 calls/hour per token. We cache results for 24h
 * per (pageId, country) pair in a simple in-memory Map (sufficient for MVP —
 * add Redis/DB cache later).
 */

const FB_API_BASE = 'https://graph.facebook.com/v20.0'
const FETCH_TIMEOUT_MS = 15000
const CACHE_TTL_MS = 24 * 60 * 60 * 1000   // 24 hours
const CACHE_MAX_SIZE = 500

// Simple LRU-ish cache to avoid hammering Meta API
interface CacheEntry<T> { value: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>()

function cacheGet<T>(key: string): T | null {
    const hit = cache.get(key)
    if (!hit) return null
    if (Date.now() > hit.expiresAt) { cache.delete(key); return null }
    // Move to end (LRU)
    cache.delete(key)
    cache.set(key, hit)
    return hit.value as T
}

function cacheSet<T>(key: string, value: T): void {
    if (cache.size >= CACHE_MAX_SIZE) {
        // Evict oldest (first entry)
        const firstKey = cache.keys().next().value
        if (firstKey) cache.delete(firstKey)
    }
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface AdLibraryAd {
    adArchiveId: string         // Meta's internal ad ID
    pageId: string
    pageName: string
    deliveryStart: string | null   // ISO date
    deliveryStop: string | null    // null = currently active
    daysActive: number              // computed
    platforms: string[]            // ['facebook', 'instagram', 'audience_network']

    // Creative content
    adCreativeBodies: string[]         // up to 3 body variations
    adCreativeLinkTitles: string[]     // link titles
    adCreativeLinkDescriptions: string[]
    adCreativeLinkCaptions: string[]

    // Media (image/video URLs from Meta — may expire)
    imageUrls: string[]
    videoUrls: string[]

    // Estimated spend signals
    impressionsRangeMin: number | null
    impressionsRangeMax: number | null
    spendRangeMin: number | null
    spendRangeMax: number | null
    currency: string | null

    // Derived — useful for ranking
    _variationCount: number     // # of body/title variations (proxy for spend)
    _adLibraryUrl: string        // https://www.facebook.com/ads/library/?id=...
}

export interface AdLibrarySearchParams {
    pageIds?: string[]                     // Facebook Page IDs
    searchTerms?: string                    // Keyword search (when no page IDs)
    country: string                         // ISO code — default 'IL'
    activeOnly?: boolean                    // only currently running (default true)
    limit?: number                          // max results per page (default 25)
    maxTotal?: number                       // stop at this total (default 50)
}

// ═══════════════════════════════════════════════════════════════════════════
// Main — fetch ads
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchAdLibraryAds(
    accessToken: string,
    params: AdLibrarySearchParams,
): Promise<{ ads: AdLibraryAd[]; error?: string }> {
    const country = params.country || 'IL'
    const activeOnly = params.activeOnly !== false
    const limit = Math.min(params.limit || 25, 50)
    const maxTotal = Math.min(params.maxTotal || 50, 250)

    // Cache key — combine key scoping params
    const cacheKey = JSON.stringify({
        pages: (params.pageIds || []).sort(),
        q: params.searchTerms || '',
        country,
        active: activeOnly,
    })
    const cached = cacheGet<AdLibraryAd[]>(cacheKey)
    if (cached) return { ads: cached }

    // Build query
    const fields = [
        'id', 'page_id', 'page_name',
        'ad_delivery_start_time', 'ad_delivery_stop_time',
        'publisher_platforms',
        'ad_creative_bodies', 'ad_creative_link_titles',
        'ad_creative_link_descriptions', 'ad_creative_link_captions',
        'ad_snapshot_url',
        'impressions', 'spend', 'currency',
    ].join(',')

    const qp = new URLSearchParams({
        access_token: accessToken,
        ad_reached_countries: `['${country}']`,
        fields,
        limit: String(limit),
    })
    if (activeOnly) qp.set('ad_active_status', 'ACTIVE')
    if (params.pageIds?.length) qp.set('search_page_ids', `[${params.pageIds.map(id => `'${id}'`).join(',')}]`)
    else if (params.searchTerms) qp.set('search_terms', params.searchTerms)
    else return { ads: [], error: 'Must provide either pageIds or searchTerms' }

    const collected: AdLibraryAd[] = []
    let nextUrl: string | null = `${FB_API_BASE}/ads_archive?${qp.toString()}`
    let pageCount = 0

    try {
        while (nextUrl && collected.length < maxTotal && pageCount < 10) {
            pageCount++
            const res = await fetch(nextUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
            if (!res.ok) {
                const errText = await res.text()
                console.error(`Meta Ad Library HTTP ${res.status}: ${errText.substring(0, 300)}`)
                return {
                    ads: collected,
                    error: `HTTP ${res.status} — ${res.status === 400 ? 'check token scopes (ads_read required)' : errText.substring(0, 200)}`,
                }
            }
            const data = await res.json() as { data?: unknown[]; paging?: { next?: string } }
            if (!data.data) break
            for (const item of data.data) {
                const normalized = normalizeAd(item as Record<string, unknown>)
                if (normalized) collected.push(normalized)
                if (collected.length >= maxTotal) break
            }
            nextUrl = data.paging?.next || null
        }
    } catch (err) {
        console.error('Meta Ad Library fetch error:', err)
        return { ads: collected, error: err instanceof Error ? err.message : String(err) }
    }

    cacheSet(cacheKey, collected)
    return { ads: collected }
}

// ═══════════════════════════════════════════════════════════════════════════
// Rank ads by "signal" — active duration × variation count = spend proxy
// ═══════════════════════════════════════════════════════════════════════════

export function rankAdsByWinnerSignal(ads: AdLibraryAd[], topN = 10): AdLibraryAd[] {
    return [...ads].sort((a, b) => {
        const scoreA = (a.daysActive || 1) * Math.max(a._variationCount, 1)
        const scoreB = (b.daysActive || 1) * Math.max(b._variationCount, 1)
        return scoreB - scoreA
    }).slice(0, topN)
}

// ═══════════════════════════════════════════════════════════════════════════
// Resolve Page ID from name — useful when user gives "Nike" instead of 123456
// ═══════════════════════════════════════════════════════════════════════════

export async function resolvePageIds(
    accessToken: string,
    pageNames: string[],
): Promise<Array<{ name: string; pageId: string | null; resolvedName?: string }>> {
    const results: Array<{ name: string; pageId: string | null; resolvedName?: string }> = []
    for (const name of pageNames) {
        try {
            const qp = new URLSearchParams({
                access_token: accessToken,
                q: name,
                type: 'page',
                fields: 'id,name,category',
                limit: '1',
            })
            const res = await fetch(`${FB_API_BASE}/pages/search?${qp.toString()}`, {
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            })
            if (!res.ok) {
                results.push({ name, pageId: null })
                continue
            }
            const data = await res.json() as { data?: Array<{ id: string; name: string }> }
            if (data.data && data.data.length > 0) {
                results.push({ name, pageId: data.data[0].id, resolvedName: data.data[0].name })
            } else {
                results.push({ name, pageId: null })
            }
        } catch {
            results.push({ name, pageId: null })
        }
    }
    return results
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function normalizeAd(raw: Record<string, unknown>): AdLibraryAd | null {
    const id = String(raw.id || '')
    if (!id) return null

    const adStart = (raw.ad_delivery_start_time as string) || null
    const adStop = (raw.ad_delivery_stop_time as string) || null
    const daysActive = computeDaysActive(adStart, adStop)

    const bodies = toStringArray(raw.ad_creative_bodies)
    const titles = toStringArray(raw.ad_creative_link_titles)
    const descriptions = toStringArray(raw.ad_creative_link_descriptions)
    const captions = toStringArray(raw.ad_creative_link_captions)

    // Meta doesn't always return media URLs in ads_archive — the ad_snapshot_url
    // is a link to the ad library page where media can be scraped. For now we
    // capture it as the canonical reference, media URL extraction is Phase B3
    // via headless browser (separate endeavor).
    const snapshotUrl = (raw.ad_snapshot_url as string) || ''

    // Impressions / spend — may be ranges like { lower_bound: "1000", upper_bound: "5000" }
    const impressions = raw.impressions as { lower_bound?: string; upper_bound?: string } | null
    const spend = raw.spend as { lower_bound?: string; upper_bound?: string } | null

    return {
        adArchiveId: id,
        pageId: String(raw.page_id || ''),
        pageName: String(raw.page_name || ''),
        deliveryStart: adStart,
        deliveryStop: adStop,
        daysActive,
        platforms: toStringArray(raw.publisher_platforms),

        adCreativeBodies: bodies,
        adCreativeLinkTitles: titles,
        adCreativeLinkDescriptions: descriptions,
        adCreativeLinkCaptions: captions,

        imageUrls: [],     // filled by Phase B3 media scraper (headless browser on snapshot_url)
        videoUrls: [],

        impressionsRangeMin: impressions?.lower_bound ? parseInt(impressions.lower_bound, 10) : null,
        impressionsRangeMax: impressions?.upper_bound ? parseInt(impressions.upper_bound, 10) : null,
        spendRangeMin: spend?.lower_bound ? parseInt(spend.lower_bound, 10) : null,
        spendRangeMax: spend?.upper_bound ? parseInt(spend.upper_bound, 10) : null,
        currency: (raw.currency as string) || null,

        _variationCount: Math.max(bodies.length, titles.length, 1),
        _adLibraryUrl: snapshotUrl || `https://www.facebook.com/ads/library/?id=${id}`,
    }
}

function toStringArray(val: unknown): string[] {
    if (Array.isArray(val)) return val.map(v => String(v)).filter(Boolean)
    if (typeof val === 'string') return [val]
    return []
}

function computeDaysActive(start: string | null, stop: string | null): number {
    if (!start) return 0
    const s = new Date(start).getTime()
    if (isNaN(s)) return 0
    const e = stop ? new Date(stop).getTime() : Date.now()
    if (isNaN(e)) return 0
    return Math.max(0, Math.floor((e - s) / (1000 * 60 * 60 * 24)))
}