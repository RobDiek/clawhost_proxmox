/**
 * Meta Ad Library — enriched competitor monitoring on Facebook/Instagram.
 *
 * Built on top of the basic services/metaAdsLibrary.ts; this version pulls
 * the FULL set of fields the Ad Library API exposes:
 *   - ad_creative_bodies / ad_creative_link_titles / ad_creative_link_descriptions
 *   - ad_creative_link_captions
 *   - ad_delivery_start_time / ad_delivery_stop_time   → run-duration analysis
 *   - ad_snapshot_url                                  → visual reference (UI link)
 *   - publisher_platforms                              → which surfaces (FB / IG / Audience Network / Messenger / Threads)
 *   - languages                                        → Hebrew vs English vs mixed
 *   - target_ages / target_gender / target_locations   → audience hints (political/issue ads only — usually empty for commercial)
 *   - bylines / page_id / page_name                    → page provenance
 *   - currency / spend (optional, political ads only)
 *
 * Why we need richer data: the basic client just returned ad COUNT +
 * sample headlines. For paid_competitor_landscape stage we want to
 * reason about:
 *   - WHICH platforms competitors test (FB-only vs FB+IG vs +Stories/Reels)
 *   - HOW LONG ads stay live (>60d = proven winners; <14d = experimentation)
 *   - WHAT angles dominate (extract from creative bodies via prompt)
 *   - WHICH PAGES they use (some competitors run from multiple pages)
 *
 * Auth: requires META_APP_ID + META_APP_SECRET env vars (we use the
 * app-secret-proof access_token pattern: `APP_ID|APP_SECRET`). The Ad
 * Library does NOT require user OAuth — it's public data.
 *
 * Rate limits: ~200 calls/hour per app. We batch 6 competitors max per
 * run. With 200/hour we can audit ~33 portfolios/hour, well within
 * platform usage.
 *
 * Israeli market: ad_reached_countries=['IL']. Filter to ads that
 * actually reached Israeli audiences (excludes ads only running EU/US).
 */

export interface MetaAdCreative {
    /** Meta's stable archive id (won't change after ad ends). */
    id: string
    /** Page that ran the ad (different competitors may share same parent business). */
    pageId: string
    pageName: string
    /** Hero text body — usually 1-3 sentences of ad copy. */
    creativeBody?: string
    /** "Headline" (bold text above CTA). */
    linkTitle?: string
    /** Sub-headline (small text below headline). */
    linkDescription?: string
    /** Brand domain shown above the creative. */
    linkCaption?: string
    /** Snapshot URL — direct link to view the ad on facebook.com/ads/library. */
    snapshotUrl?: string
    /** When Meta first showed the ad. */
    deliveryStartTime?: string         // ISO
    /** When Meta stopped serving (still in archive for 7 years). null if still active. */
    deliveryStopTime?: string | null
    /** Days the ad has run / ran. Computed: stop - start (or now - start if still running). */
    runDurationDays?: number
    /** Surfaces where the ad showed: 'facebook'|'instagram'|'messenger'|'audience_network'|'threads'. */
    publisherPlatforms: string[]
    /** Languages detected: ['he'], ['en'], ['he','en'], etc. */
    languages: string[]
    /** Political/issue ads only — usually undefined for commercial. */
    targetingAgeRange?: { min?: string; max?: string }
    targetingGender?: string
    targetingLocations?: string[]
    /** Whether the ad is currently active (delivery_stop_time is null/future). */
    isActive: boolean
}

export interface MetaCompetitorAudit {
    /** Search query we used (page name or domain root). */
    competitor: string
    /** Pages found matching that query — Meta sometimes returns multiple pages per query. */
    pages: Array<{
        pageId: string
        pageName: string
        adCount: number
        activeAdCount: number
        /** Median run-duration across this page's currently-active ads. */
        medianActiveRunDays: number
        /** Earliest ad start date across all archives (signals when they started running ads). */
        oldestAdStarted?: string
    }>
    /** Flattened ad list across all pages we found for this competitor. */
    creatives: MetaAdCreative[]
    /** Distinct platforms across all creatives. */
    platforms: string[]
    /** Distinct languages across all creatives. */
    languages: string[]
    /** Error reason if we couldn't fetch — surfaces in audit warnings. */
    error?: string
}

export interface MetaAdLibraryResult {
    available: boolean
    reason?: string
    competitorsRequested: string[]
    competitorsScanned: number
    competitors: MetaCompetitorAudit[]
    /** API + auth diagnostics for ops surfacing. */
    diagnostics: {
        appIdConfigured: boolean
        appSecretConfigured: boolean
        callsAttempted: number
        callsFailed: number
    }
}

const META_GRAPH_API = 'https://graph.facebook.com/v19.0/ads_archive'
const META_MAX_COMPETITORS = 6
const META_ADS_PER_QUERY = 25     // Top-25 most recent ads per competitor — enough signal w/o paginating

/** Days the ad was live. If stop_time is null/future, count from start to now. */
function computeRunDays(start: string | undefined, stop: string | null | undefined): number | undefined {
    if (!start) return undefined
    const startMs = new Date(start).getTime()
    if (!Number.isFinite(startMs)) return undefined
    const endMs = stop ? new Date(stop).getTime() : Date.now()
    if (!Number.isFinite(endMs)) return undefined
    return Math.max(0, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)))
}

/** Hebrew detection: characters in Unicode Hebrew block U+0590-U+05FF. */
function detectLanguages(body?: string, title?: string): string[] {
    const txt = ((body || '') + ' ' + (title || '')).trim()
    if (!txt) return []
    const langs: string[] = []
    if (/[֐-׿]/.test(txt)) langs.push('he')
    if (/[a-zA-Z]{4,}/.test(txt)) langs.push('en')
    return langs
}

function median(arr: number[]): number {
    if (arr.length === 0) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

async function fetchCompetitorAds(query: string, accessToken: string): Promise<MetaCompetitorAudit> {
    const audit: MetaCompetitorAudit = {
        competitor: query,
        pages: [],
        creatives: [],
        platforms: [],
        languages: [],
    }

    const fields = [
        'id',
        'page_id',
        'page_name',
        'ad_creative_bodies',
        'ad_creative_link_titles',
        'ad_creative_link_descriptions',
        'ad_creative_link_captions',
        'ad_snapshot_url',
        'ad_delivery_start_time',
        'ad_delivery_stop_time',
        'publisher_platforms',
        'languages',
        'target_ages',
        'target_gender',
        'target_locations',
        'bylines',
    ].join(',')

    const params = new URLSearchParams({
        search_terms: query,
        ad_reached_countries: '["IL"]',
        ad_active_status: 'ALL',         // include both active + recently-stopped to detect runners
        fields,
        limit: String(META_ADS_PER_QUERY),
        access_token: accessToken,
    })

    try {
        const res = await fetch(`${META_GRAPH_API}?${params.toString()}`, {
            signal: AbortSignal.timeout(20_000),
        })
        if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            audit.error = `Meta API ${res.status}: ${errBody.slice(0, 200)}`
            return audit
        }
        const j = await res.json() as { data?: Array<Record<string, unknown>> }
        const rows = j.data || []

        for (const row of rows) {
            const start = row.ad_delivery_start_time as string | undefined
            const stop = row.ad_delivery_stop_time as string | null | undefined
            const runDays = computeRunDays(start, stop)
            const isActive = !stop || new Date(stop).getTime() > Date.now()

            const creativeBody = Array.isArray(row.ad_creative_bodies)
                ? String((row.ad_creative_bodies as unknown[])[0] || '')
                : undefined
            const linkTitle = Array.isArray(row.ad_creative_link_titles)
                ? String((row.ad_creative_link_titles as unknown[])[0] || '')
                : undefined
            const linkDescription = Array.isArray(row.ad_creative_link_descriptions)
                ? String((row.ad_creative_link_descriptions as unknown[])[0] || '')
                : undefined
            const linkCaption = Array.isArray(row.ad_creative_link_captions)
                ? String((row.ad_creative_link_captions as unknown[])[0] || '')
                : undefined

            const creative: MetaAdCreative = {
                id: String(row.id || ''),
                pageId: String(row.page_id || ''),
                pageName: String(row.page_name || ''),
                creativeBody: creativeBody || undefined,
                linkTitle: linkTitle || undefined,
                linkDescription: linkDescription || undefined,
                linkCaption: linkCaption || undefined,
                snapshotUrl: row.ad_snapshot_url ? String(row.ad_snapshot_url) : undefined,
                deliveryStartTime: start || undefined,
                deliveryStopTime: stop ?? null,
                runDurationDays: runDays,
                publisherPlatforms: Array.isArray(row.publisher_platforms)
                    ? (row.publisher_platforms as string[]).map(String)
                    : [],
                languages: Array.isArray(row.languages) && (row.languages as string[]).length > 0
                    ? (row.languages as string[]).map(String)
                    : detectLanguages(creativeBody, linkTitle),
                targetingAgeRange: row.target_ages as MetaAdCreative['targetingAgeRange'],
                targetingGender: row.target_gender as string | undefined,
                targetingLocations: Array.isArray(row.target_locations)
                    ? (row.target_locations as string[]).map(String)
                    : undefined,
                isActive,
            }
            audit.creatives.push(creative)
        }

        // Aggregate per-page roll-up
        const byPage = new Map<string, MetaAdCreative[]>()
        for (const c of audit.creatives) {
            const key = c.pageId || c.pageName
            if (!byPage.has(key)) byPage.set(key, [])
            byPage.get(key)!.push(c)
        }
        for (const [pageId, ads] of byPage.entries()) {
            const activeAds = ads.filter(a => a.isActive)
            const activeRunDays = activeAds.map(a => a.runDurationDays || 0).filter(d => d > 0)
            audit.pages.push({
                pageId,
                pageName: ads[0].pageName,
                adCount: ads.length,
                activeAdCount: activeAds.length,
                medianActiveRunDays: median(activeRunDays),
                oldestAdStarted: ads
                    .map(a => a.deliveryStartTime)
                    .filter((d): d is string => !!d)
                    .sort()[0],
            })
        }

        // Distinct platforms + languages
        const platformSet = new Set<string>()
        const langSet = new Set<string>()
        for (const c of audit.creatives) {
            c.publisherPlatforms.forEach(p => platformSet.add(p))
            c.languages.forEach(l => langSet.add(l))
        }
        audit.platforms = Array.from(platformSet).sort()
        audit.languages = Array.from(langSet).sort()

        return audit
    } catch (err) {
        audit.error = `Meta API exception: ${(err as Error).message}`
        return audit
    }
}

export async function auditMetaAdLibrary(competitorsOrDomains: string[]): Promise<MetaAdLibraryResult> {
    const appId = process.env.META_APP_ID || ''
    const appSecret = process.env.META_APP_SECRET || ''
    const diagnostics = {
        appIdConfigured: !!appId,
        appSecretConfigured: !!appSecret,
        callsAttempted: 0,
        callsFailed: 0,
    }

    if (!appId || !appSecret) {
        return {
            available: false,
            reason: 'Meta App credentials missing (META_APP_ID, META_APP_SECRET)',
            competitorsRequested: competitorsOrDomains,
            competitorsScanned: 0,
            competitors: [],
            diagnostics,
        }
    }

    if (!competitorsOrDomains || competitorsOrDomains.length === 0) {
        return {
            available: false,
            reason: 'No competitors provided',
            competitorsRequested: [],
            competitorsScanned: 0,
            competitors: [],
            diagnostics,
        }
    }

    const accessToken = `${appId}|${appSecret}`
    const targets = competitorsOrDomains.slice(0, META_MAX_COMPETITORS)
    const cleanedTargets = targets.map(t => t
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./i, '')
        .replace(/\.(co\.il|com|net|org)$/i, ''),
    )

    const competitors: MetaCompetitorAudit[] = []
    for (let i = 0; i < cleanedTargets.length; i++) {
        diagnostics.callsAttempted++
        const audit = await fetchCompetitorAds(cleanedTargets[i], accessToken)
        // Annotate audit.competitor with ORIGINAL query (cleanedTargets[i] might
        // not match original domain spelling).
        audit.competitor = targets[i]
        if (audit.error) diagnostics.callsFailed++
        competitors.push(audit)
    }

    const totalCreatives = competitors.reduce((s, c) => s + c.creatives.length, 0)
    return {
        available: totalCreatives > 0,
        reason: totalCreatives === 0
            ? 'No Meta ads found for the requested competitors in Israel. May need to broaden search terms or check Meta App permissions.'
            : undefined,
        competitorsRequested: targets,
        competitorsScanned: cleanedTargets.length,
        competitors,
        diagnostics,
    }
}

/**
 * Render the Meta result as a prompt-ready Hebrew context block. The
 * stage prompt embeds this so Opus can reason on creative patterns
 * without having to re-call the API.
 */
export function renderMetaContextForPrompt(r: MetaAdLibraryResult): string {
    if (!r.available) {
        return `═══ META AD LIBRARY (IL) ═══\n(${r.reason || 'unavailable'})\n\nDiagnostics: appId=${r.diagnostics.appIdConfigured}, appSecret=${r.diagnostics.appSecretConfigured}, attempts=${r.diagnostics.callsAttempted}, failed=${r.diagnostics.callsFailed}`
    }

    const blocks = r.competitors.map(c => {
        if (c.error) return `${c.competitor}: ERROR — ${c.error}`
        if (c.creatives.length === 0) return `${c.competitor}: no active ads in IL`

        const activeAds = c.creatives.filter(a => a.isActive)
        const longRunners = activeAds.filter(a => (a.runDurationDays || 0) >= 60)
        const samplesHe = c.creatives
            .filter(a => a.languages.includes('he'))
            .slice(0, 3)
            .map(a => {
                const dur = a.runDurationDays !== undefined ? ` [${a.runDurationDays}d${a.isActive ? ' active' : ''}]` : ''
                return `   • ${(a.creativeBody || a.linkTitle || '').slice(0, 140).replace(/\s+/g, ' ')}${dur}`
            })
            .join('\n')

        return [
            `${c.competitor}:`,
            `   pages: ${c.pages.length}, ads: ${c.creatives.length} (${activeAds.length} active, ${longRunners.length} long-running ≥60d)`,
            `   platforms: ${c.platforms.join('/') || 'unknown'}`,
            `   languages: ${c.languages.join('/') || 'unknown'}`,
            samplesHe ? `   sample Hebrew creatives:\n${samplesHe}` : '',
        ].filter(Boolean).join('\n')
    }).join('\n\n')

    return [
        '═══ META AD LIBRARY (IL) — Competitor Active Ads ═══',
        '',
        blocks,
        '',
        'KEY SIGNALS TO USE:',
        '- Long-running ads (≥60d active) = PROVEN winners. Their angle/hook is validated.',
        '- Short-running ads (<14d) = experimentation. Note them but don\'t copy blindly.',
        '- Platform mix (FB-only vs FB+IG vs +Reels) indicates competitor\'s audience focus.',
        '- Language mix: Hebrew-only = local SMB; bilingual = global brand or B2B.',
        '- Multiple pages per competitor = different geos / brands. Note which page generates most ads.',
    ].join('\n')
}