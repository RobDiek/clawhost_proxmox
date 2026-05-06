/**
 * Meta Ads Library — competitor monitoring on Facebook/Instagram.
 *
 * In Israel, SMBs typically advertise more on Meta than Google. We can pull
 * a competitor's currently active ads (creative + first-launch date) without
 * authentication via the Meta Ad Library Graph endpoint.
 *
 * No API key required for the public endpoint, but rate-limited; we cap
 * to 6 competitor pages per audit run.
 *
 * Note: Meta requires `access_token=APP_ID|APP_SECRET` — using a public
 * "graph" approach without auth is best-effort. If this returns nothing we
 * surface as missing.
 */

export interface MetaAdsResult {
    available: boolean
    reason?: string
    competitorsScanned: number
    creatives: Array<{
        competitor: string
        adCount: number
        sampleHeadlines: string[]
        platforms: string[]
    }>
}

export async function pullMetaAdsLibrary(competitorPagesOrDomains: string[]): Promise<MetaAdsResult> {
    if (!competitorPagesOrDomains || competitorPagesOrDomains.length === 0) {
        return { available: false, reason: 'No competitor names provided', competitorsScanned: 0, creatives: [] }
    }

    const appId = process.env.META_APP_ID || ''
    const appSecret = process.env.META_APP_SECRET || ''
    if (!appId || !appSecret) {
        return { available: false, reason: 'Meta API app credentials not configured (META_APP_ID, META_APP_SECRET)', competitorsScanned: 0, creatives: [] }
    }
    const accessToken = `${appId}|${appSecret}`

    const targets = competitorPagesOrDomains.slice(0, 6)
    const creatives: MetaAdsResult['creatives'] = []
    let scanned = 0
    for (const t of targets) {
        try {
            // search by page name — cleaner than domain
            const q = t.replace(/https?:\/\//, '').replace(/\/.*$/, '').replace(/\.co.*$/, '').replace(/\.com$/, '')
            const url = `https://graph.facebook.com/v19.0/ads_archive?search_terms=${encodeURIComponent(q)}&ad_reached_countries=['IL']&ad_active_status=ACTIVE&fields=id,ad_creative_bodies,ad_creative_link_titles,publisher_platforms&limit=12&access_token=${accessToken}`
            const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
            if (!res.ok) { scanned++; continue }
            const j = await res.json() as { data?: any[] }
            const ads = j.data || []
            const headlines = ads.flatMap((a: any) => a.ad_creative_link_titles || []).slice(0, 8)
            const platforms = [...new Set(ads.flatMap((a: any) => a.publisher_platforms || []))] as string[]
            if (ads.length > 0) {
                creatives.push({
                    competitor: t,
                    adCount: ads.length,
                    sampleHeadlines: headlines.map(String),
                    platforms,
                })
            }
            scanned++
        } catch { scanned++ }
    }

    return { available: creatives.length > 0, reason: creatives.length === 0 ? 'No active Meta ads found for these competitors' : undefined, competitorsScanned: scanned, creatives }
}

export function renderMetaAdsContext(r: MetaAdsResult): string {
    if (!r.available) return `═══ META ADS LIBRARY ═══\n\n(${r.reason || 'unavailable'})`
    const blocks = r.creatives.map(c => `${c.competitor} (${c.adCount} ads, platforms: ${c.platforms.join(',')})\n  Headlines: ${c.sampleHeadlines.slice(0, 4).join(' | ')}`).join('\n\n')
    return `═══ META ADS LIBRARY — Competitor Active Ads (IL) ═══

${blocks}

USE THIS DATA:
- If competitor X is heavily on Meta but not Google → consider Meta channel for THIS client too
- Meta headlines reveal positioning angle competitors test → can inform Google Ads RSA copy`
}