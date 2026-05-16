/**
 * Google Ads Transparency Center — Firecrawl-based extractor.
 *
 * Replaces the legacy services/googleAdsTransparency.ts which depended on
 * the internal RPC endpoint /anji/_/rpc/AdvertiserService/SearchAdvertisers.
 * Google removed/renamed that endpoint in 2025 (returns 404 as of 2026-05-16);
 * the public UI at adstransparency.google.com still works fine for humans.
 *
 * Approach: Firecrawl scrapes the rendered Transparency Center page filtered
 * by domain + region, then their LLM-extract feature pulls structured ad
 * data from the page DOM. Same shape as the old result so the prefetcher
 * + prompt builder don't need changes.
 *
 * Cost: ~$0.01 per competitor (Firecrawl's extract feature). 8 competitors
 * → ~$0.08 per stage run. Acceptable.
 *
 * Trade-off vs the old internal RPC:
 *   + Stable (UI changes much less than internal RPC)
 *   + No undocumented protobuf schema reverse-engineering
 *   + Tolerant to schema shifts (LLM adapts)
 *   - Per-call cost (was free; now ~$0.01)
 *   - Slower (~3-5s per competitor vs ~500ms internal RPC)
 */

interface TransparencyAd {
    advertiserId: string
    advertiserName: string
    creativeId: string
    format: string
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
    diagnostics?: {
        firecrawlCallsAttempted: number
        firecrawlCallsFailed: number
        latencyMs: number
        notes: string[]
    }
}

/**
 * Firecrawl-extract a single competitor's Transparency Center page.
 * Returns the structured extraction or null on failure.
 */
async function scrapeTransparencyPage(
    domain: string,
    firecrawlKey: string,
    region: string,
): Promise<{ advertiserName?: string; advertiserId?: string; ads: TransparencyAd[] } | null> {
    const url = `https://adstransparency.google.com/?region=${encodeURIComponent(region)}&domain=${encodeURIComponent(domain)}&hl=he`
    try {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${firecrawlKey}`,
            },
            body: JSON.stringify({
                url,
                formats: ['extract'],
                extract: {
                    prompt:
                        'You are reading the Google Ads Transparency Center page for a specific advertiser in a specific region. ' +
                        'Extract every visible ad creative shown on this page. For each ad capture: ' +
                        'format (TEXT / IMAGE / VIDEO / OTHER), headlines (array of strings exactly as shown), ' +
                        'descriptions (array of strings), landingUrl (the final-destination URL displayed under the ad), ' +
                        'firstShown and lastShown (ISO dates if shown). Also capture advertiserName and advertiserId ' +
                        'if visible in the page header or URL. If the page shows "no ads" / "0 results" / empty state, ' +
                        'return an empty ads array. Do NOT invent data — only extract what is visible.',
                    schema: {
                        type: 'object',
                        properties: {
                            advertiserName: { type: 'string', description: 'Advertiser display name from page header' },
                            advertiserId: { type: 'string', description: 'Advertiser ID from URL or page metadata' },
                            ads: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        format: { type: 'string', enum: ['TEXT', 'IMAGE', 'VIDEO', 'OTHER'] },
                                        headlines: { type: 'array', items: { type: 'string' } },
                                        descriptions: { type: 'array', items: { type: 'string' } },
                                        landingUrl: { type: 'string' },
                                        firstShown: { type: 'string' },
                                        lastShown: { type: 'string' },
                                    },
                                },
                            },
                        },
                        required: ['ads'],
                    },
                },
                waitFor: 4000,      // SPA needs time to render ad cards
                timeout: 35_000,
            }),
            signal: AbortSignal.timeout(50_000),
        })
        if (!res.ok) return null
        const body = await res.json() as {
            success?: boolean
            data?: {
                extract?: {
                    advertiserName?: string
                    advertiserId?: string
                    ads?: Array<{
                        format?: string
                        headlines?: string[]
                        descriptions?: string[]
                        landingUrl?: string
                        firstShown?: string
                        lastShown?: string
                    }>
                }
            }
        }
        if (!body.success || !body.data?.extract) return null
        const e = body.data.extract
        const advertiserName = e.advertiserName || ''
        const advertiserId = e.advertiserId || ''
        const ads: TransparencyAd[] = (e.ads || []).map((a, idx) => ({
            advertiserId,
            advertiserName,
            creativeId: `${advertiserId}-${idx}`,    // synthetic when not exposed
            format: (a.format || 'OTHER').toUpperCase(),
            firstShown: a.firstShown,
            lastShown: a.lastShown,
            headlines: a.headlines,
            descriptions: a.descriptions,
            landingUrl: a.landingUrl,
            region,
        }))
        return { advertiserName, advertiserId, ads }
    } catch {
        return null
    }
}

export async function enrichWithGoogleAdsTransparencyV2(
    competitorDomains: string[],
    options: { region?: string; perCompetitorLimit?: number; firecrawlKey?: string | null } = {},
): Promise<TransparencyResult> {
    const startedAt = Date.now()
    if (!competitorDomains || competitorDomains.length === 0) {
        return {
            available: false,
            reason: 'No competitor domains provided',
            competitorsRequested: [],
            competitorsFound: [],
            ads: [],
            diagnostics: { firecrawlCallsAttempted: 0, firecrawlCallsFailed: 0, latencyMs: 0, notes: [] },
        }
    }
    const firecrawlKey = options.firecrawlKey || process.env.FIRECRAWL_API_KEY || ''
    if (!firecrawlKey) {
        return {
            available: false,
            reason: 'Firecrawl API key not configured — required for Transparency Center scraping after Google removed the internal RPC (2025+)',
            competitorsRequested: competitorDomains,
            competitorsFound: [],
            ads: [],
            diagnostics: { firecrawlCallsAttempted: 0, firecrawlCallsFailed: 0, latencyMs: Date.now() - startedAt, notes: [] },
        }
    }
    const region = options.region || 'IL'
    const limit = options.perCompetitorLimit ?? 10

    const cleaned = Array.from(new Set(
        competitorDomains.map(d => d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')),
    )).slice(0, 8)

    const notes: string[] = []
    // IL Shabbat caution: Saturday is a low-spend day for Israeli SMB advertisers.
    // Many pause campaigns Friday evening → Saturday evening (sunset to sunset).
    // If we run on Saturday and see few/no ads, this is a likely explanation —
    // worth surfacing to Opus so it doesn't conclude "competitor doesn't run Google Ads"
    // from a single Shabbat snapshot.
    if (region === 'IL') {
        const day = new Date().getUTCDay()        // 6 = Saturday in UTC
        if (day === 6 || day === 5) {              // Friday evening too
            notes.push('Snapshot taken on Friday/Saturday (IL Shabbat). Many IL SMBs pause Google Ads campaigns for Shabbat — empty results may reflect schedule, not absence of paid activity. Treat 0-ads counts on this run with weekend caution.')
        }
    }

    const found: string[] = []
    const allAds: TransparencyAd[] = []
    let attempted = 0
    let failed = 0

    // Parallelize but cap concurrency to 4 to avoid overwhelming Firecrawl
    // and to stay under per-account rate limits.
    const CONCURRENCY = 4
    for (let i = 0; i < cleaned.length; i += CONCURRENCY) {
        const batch = cleaned.slice(i, i + CONCURRENCY)
        const results = await Promise.all(batch.map(async domain => {
            attempted++
            const r = await scrapeTransparencyPage(domain, firecrawlKey, region)
            if (!r) { failed++; return { domain, advertiser: null, ads: [] as TransparencyAd[] } }
            return { domain, advertiser: r, ads: r.ads.slice(0, limit) }
        }))
        for (const r of results) {
            if (r.ads.length > 0) {
                found.push(r.domain)
                allAds.push(...r.ads)
            }
        }
    }

    return {
        available: true,
        competitorsRequested: cleaned,
        competitorsFound: found,
        ads: allAds,
        diagnostics: {
            firecrawlCallsAttempted: attempted,
            firecrawlCallsFailed: failed,
            latencyMs: Date.now() - startedAt,
            notes,
        },
    }
}

export function renderTransparencyContextV2(r: TransparencyResult): string {
    if (!r.available) {
        return `═══ GOOGLE ADS TRANSPARENCY CENTER — COMPETITOR ACTIVE ADS ═══\n\n(unavailable: ${r.reason || 'unknown'})`
    }
    if (r.ads.length === 0) {
        const notes = (r.diagnostics?.notes || []).join('\n  • ')
        return `═══ GOOGLE ADS TRANSPARENCY CENTER — COMPETITOR ACTIVE ADS ═══\n\nNo ads found for any of ${r.competitorsRequested.length} competitors.${notes ? '\n\nContext:\n  • ' + notes : ''}`
    }
    const byCompetitor: Record<string, TransparencyAd[]> = {}
    for (const ad of r.ads) {
        const k = ad.advertiserName || ad.advertiserId || 'unknown'
        if (!byCompetitor[k]) byCompetitor[k] = []
        byCompetitor[k].push(ad)
    }
    const sections = Object.entries(byCompetitor).map(([name, ads]) => {
        const lines = ads.slice(0, 5).map(a => {
            const h = (a.headlines || []).slice(0, 5).filter(Boolean).join(' | ')
            const d = (a.descriptions || []).slice(0, 2).filter(Boolean).join(' | ')
            const lp = a.landingUrl ? '  LP: ' + a.landingUrl : ''
            const ds = a.firstShown && a.lastShown ? `  (${a.firstShown} → ${a.lastShown})` : ''
            return `    [${a.format}]${h ? ' HEADLINES: ' + h : ''}${d ? '  DESCRIPTIONS: ' + d : ''}${lp}${ds}`
        })
        return `  ${name} (${ads.length} active ads):\n${lines.join('\n')}`
    })
    const notesBlock = (r.diagnostics?.notes || []).length > 0
        ? `\n\n⚠️ Context to factor into analysis:\n  • ${(r.diagnostics?.notes || []).join('\n  • ')}`
        : ''
    return `═══ GOOGLE ADS TRANSPARENCY CENTER — COMPETITOR ACTIVE ADS ═══\n\n` +
        `Searched ${r.competitorsRequested.length} domains, found ${r.competitorsFound.length} advertisers, ${r.ads.length} ads:\n\n` +
        sections.join('\n\n') +
        notesBlock +
        `\n\nUSE THIS DATA when crafting RSA headlines/descriptions:\n` +
        `  - DON'T copy verbatim — identify STYLE/ANGLE patterns, then differentiate\n` +
        `  - Note messaging gaps (price vs trust vs speed)\n` +
        `  - Note format mix (TEXT-only vs IMAGE/VIDEO)`
}