// Google Ads Transparency Center scraper.
//
// Pulls active ad creatives from competitors so Mazhir media plan can
// reference real RSA copy patterns (headlines, descriptions, CTAs) instead
// of inventing them. Public data — no auth needed.
//
// API: undocumented but stable internal endpoint
//   https://adstransparency.google.com/anji/_/rpc/SearchService/SearchCreatives
// Used by adstransparency.google.com SPA. Body is protobuf-flavored JSON.
//
// We accept domain names (e.g. "competitor.co.il") and resolve to advertiser
// IDs, then pull their creatives.

interface TransparencyAd {
    advertiserId: string
    advertiserName: string
    creativeId: string
    format: string                  // 'TEXT', 'IMAGE', 'VIDEO'
    firstShown?: string
    lastShown?: string
    headlines?: string[]
    descriptions?: string[]
    landingUrl?: string
    region?: string
}

interface TransparencyResult {
    available: boolean
    reason?: string
    competitorsRequested: string[]
    competitorsFound: string[]
    ads: TransparencyAd[]
}

const SEARCH_ENDPOINT = 'https://adstransparency.google.com/anji/_/rpc/SearchService/SearchCreatives'
const ADVERTISER_ENDPOINT = 'https://adstransparency.google.com/anji/_/rpc/AdvertiserService/SearchAdvertisers'

async function findAdvertiserId(domain: string): Promise<{ id: string; name: string } | null> {
    try {
        const res = await fetch(`${ADVERTISER_ENDPOINT}?authuser=`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Same-Domain': '1',
                'Origin': 'https://adstransparency.google.com',
                'Referer': 'https://adstransparency.google.com/',
            },
            body: 'f.req=' + encodeURIComponent(JSON.stringify({ 1: domain, 2: 30 })),
            signal: AbortSignal.timeout(15_000),
        })
        const j = await res.json() as { 1?: Array<{ 1: string; 2: string; 3?: string }> }
        const matches = j[1] || []
        if (matches.length === 0) return null
        // Prefer name match, otherwise first result
        const exact = matches.find(m => (m[2] || '').toLowerCase().includes(domain.toLowerCase().replace(/^www\./, '').split('.')[0])) || matches[0]
        return { id: exact[1], name: exact[2] }
    } catch { return null }
}

async function fetchCreatives(advertiserId: string, region = 'IL', limit = 20): Promise<TransparencyAd[]> {
    try {
        const res = await fetch(`${SEARCH_ENDPOINT}?authuser=`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Same-Domain': '1',
                'Origin': 'https://adstransparency.google.com',
                'Referer': 'https://adstransparency.google.com/',
            },
            body: 'f.req=' + encodeURIComponent(JSON.stringify({
                2: { 13: { 1: advertiserId } },
                3: limit,
                7: { 1: { 1: region } },
            })),
            signal: AbortSignal.timeout(20_000),
        })
        const j = await res.json() as { 1?: Array<Record<string, unknown>> }
        return (j[1] || []).slice(0, limit).map(c => {
            // The internal proto encoding nests creative data under various
            // numeric keys. We extract conservatively — fields may be missing.
            const meta = c as any
            return {
                advertiserId,
                advertiserName: '',
                creativeId: meta[1] || '',
                format: meta[3] === 1 ? 'TEXT' : meta[3] === 2 ? 'IMAGE' : meta[3] === 3 ? 'VIDEO' : 'OTHER',
                firstShown: meta[6],
                lastShown: meta[7],
                headlines: meta[8]?.[1] || undefined,
                descriptions: meta[8]?.[2] || undefined,
                landingUrl: meta[8]?.[3] || undefined,
                region,
            } as TransparencyAd
        })
    } catch { return [] }
}

export async function enrichWithGoogleAdsTransparency(
    competitorDomains: string[],
    options: { region?: string; perCompetitorLimit?: number } = {},
): Promise<TransparencyResult> {
    if (!competitorDomains || competitorDomains.length === 0) {
        return { available: false, reason: 'No competitor domains provided', competitorsRequested: [], competitorsFound: [], ads: [] }
    }
    const region = options.region ?? 'IL'
    const limit = options.perCompetitorLimit ?? 10
    const cleaned = Array.from(new Set(competitorDomains.map(d => d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')))).slice(0, 8)

    const found: string[] = []
    const allAds: TransparencyAd[] = []
    for (const domain of cleaned) {
        const advertiser = await findAdvertiserId(domain)
        if (!advertiser) continue
        found.push(domain)
        const ads = await fetchCreatives(advertiser.id, region, limit)
        for (const a of ads) {
            a.advertiserName = advertiser.name
            allAds.push(a)
        }
    }

    return {
        available: true,
        competitorsRequested: cleaned,
        competitorsFound: found,
        ads: allAds,
    }
}

export function renderTransparencyContext(r: TransparencyResult): string {
    if (!r.available || r.ads.length === 0) {
        return `═══ GOOGLE ADS TRANSPARENCY CENTER — COMPETITOR ACTIVE ADS ═══\n\n(${r.reason || 'no ads found in transparency center'})`
    }
    const byCompetitor: Record<string, TransparencyAd[]> = {}
    for (const ad of r.ads) {
        const k = ad.advertiserName || ad.advertiserId
        if (!byCompetitor[k]) byCompetitor[k] = []
        byCompetitor[k].push(ad)
    }
    const sections = Object.entries(byCompetitor).map(([name, ads]) => {
        const lines = ads.slice(0, 5).map(a => {
            const h = (a.headlines || []).slice(0, 5).filter(Boolean).join(' | ')
            const d = (a.descriptions || []).slice(0, 2).filter(Boolean).join(' | ')
            return `    [${a.format}] ${h ? 'HEADLINES: ' + h : ''}${d ? '  DESCRIPTIONS: ' + d : ''}${a.landingUrl ? '  LP: ' + a.landingUrl : ''}`
        })
        return `  ${name} (${ads.length} active ads):\n${lines.join('\n')}`
    })
    return `═══ GOOGLE ADS TRANSPARENCY CENTER — COMPETITOR ACTIVE ADS ═══

Searched ${r.competitorsRequested.length} domains, found ${r.competitorsFound.length} advertisers, ${r.ads.length} ads:

${sections.join('\n\n')}

USE THIS DATA when crafting RSA headlines/descriptions:
  - DON'T copy verbatim — the goal is to identify what STYLE/ANGLE competitors use, then pick a different one
  - Look for messaging gaps: if all competitors push price, push trust. If all push trust, push speed.
  - Note format mix — if everyone runs only TEXT, an IMAGE/VIDEO Performance Max may differentiate`
}