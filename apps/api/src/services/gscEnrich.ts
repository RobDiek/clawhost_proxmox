// Google Search Console enrichment for Mazhir audit + media plan.
//
// Pulls top organic queries — what users already find this site for. Used by
// Mazhir to:
//   1. Identify cannibalization risk (paid bidding on terms that rank #1-3 organically wastes budget)
//   2. Find content gaps (terms with high impressions but poor position → paid lift candidate)
//   3. Validate keyword themes (terms organic users actually convert on)
//
// Auth: client's gscTokens (OAuth refresh token + site URL chosen via GSC connect flow).

interface GSCQuery {
    query: string
    clicks: number
    impressions: number
    ctr: number
    position: number
}

interface GSCResult {
    available: boolean
    reason?: string
    siteUrl?: string
    queries: GSCQuery[]
    daysAnalyzed: number
}

interface GSCTokens {
    accessToken?: string
    refreshToken?: string
    siteUrl?: string
    sites?: string[]
    expiresAt?: number
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<string | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID || ''
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!clientId || !clientSecret) return null
    try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        })
        const j = await res.json() as { access_token?: string; error?: string }
        return j.access_token || null
    } catch { return null }
}

export async function enrichWithGSC(
    gscTokens: GSCTokens | null | undefined,
    options: { days?: number; rowLimit?: number } = {},
): Promise<GSCResult> {
    if (!gscTokens?.refreshToken || !gscTokens.siteUrl) {
        return { available: false, reason: 'GSC not connected or no site selected', queries: [], daysAnalyzed: 0 }
    }

    const days = options.days ?? 90
    const rowLimit = options.rowLimit ?? 100
    const accessToken = (gscTokens.expiresAt && gscTokens.expiresAt > Date.now() && gscTokens.accessToken)
        ? gscTokens.accessToken
        : await refreshGoogleAccessToken(gscTokens.refreshToken)
    if (!accessToken) {
        return { available: false, reason: 'Could not refresh GSC token', queries: [], daysAnalyzed: 0, siteUrl: gscTokens.siteUrl }
    }

    // Resolve which GSC property (sc-domain: vs URL-prefix) actually has
    // permission for the stored siteUrl. List sites + pick best match.
    let resolvedSite = gscTokens.siteUrl
    try {
        const sitesRes = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(15_000),
        })
        const sitesJ = await sitesRes.json() as { siteEntry?: Array<{ siteUrl: string; permissionLevel?: string }> }
        const all = (sitesJ.siteEntry || []).filter(s => s.permissionLevel && s.permissionLevel !== 'siteUnverifiedUser')
        const host = (gscTokens.siteUrl || '').replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase().replace(/^www\./, '')
        const brand = host.split('.')[0]
        const domainMatch = all.find(s => s.siteUrl === `sc-domain:${host}`)
        const prefixMatch = all.find(s => s.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase() === host)
        const brandMatch = all.find(s => s.siteUrl.toLowerCase().includes(brand))
        resolvedSite = domainMatch?.siteUrl || prefixMatch?.siteUrl || brandMatch?.siteUrl || gscTokens.siteUrl
    } catch { /* fall back to stored siteUrl */ }

    const endDate = new Date()
    const startDate = new Date(Date.now() - days * 24 * 3600 * 1000)
    const queryUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(resolvedSite)}/searchAnalytics/query`

    try {
        const res = await fetch(queryUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDate: startDate.toISOString().slice(0, 10),
                endDate: endDate.toISOString().slice(0, 10),
                dimensions: ['query'],
                rowLimit,
            }),
            signal: AbortSignal.timeout(30_000),
        })
        const j = await res.json() as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>; error?: { message?: string } }
        if (j.error) {
            return { available: false, reason: `GSC API: ${j.error.message}`, queries: [], daysAnalyzed: days, siteUrl: resolvedSite }
        }
        const queries: GSCQuery[] = (j.rows || []).map(r => ({
            query: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
        }))
        return { available: true, queries, daysAnalyzed: days, siteUrl: resolvedSite }
    } catch (err) {
        return { available: false, reason: `GSC fetch failed: ${(err as Error).message}`, queries: [], daysAnalyzed: days, siteUrl: resolvedSite }
    }
}

export function renderGSCContext(r: GSCResult): string {
    if (!r.available || r.queries.length === 0) {
        return `═══ GOOGLE SEARCH CONSOLE — ORGANIC TOP QUERIES ═══\n\n(${r.reason || 'no data'})`
    }
    const cannibalRisk = r.queries.filter(q => q.position <= 3 && q.clicks >= 5).slice(0, 15)
    const gapCandidates = r.queries.filter(q => q.impressions >= 50 && q.position >= 8 && q.position <= 30).slice(0, 15)
    const fmtRow = (q: GSCQuery) => `  ${q.query.padEnd(40)} | imp=${q.impressions.toString().padStart(5)} | clicks=${q.clicks.toString().padStart(4)} | pos=${q.position.toFixed(1).padStart(4)} | ctr=${(q.ctr * 100).toFixed(1)}%`

    return `═══ GOOGLE SEARCH CONSOLE — ORGANIC TOP QUERIES (last ${r.daysAnalyzed} days, site=${r.siteUrl}) ═══

${r.queries.length} queries measured. KEY SEGMENTS:

>>> CANNIBALIZATION RISK (already ranking 1-3 organically — DO NOT bid these in paid):
${cannibalRisk.length ? cannibalRisk.map(fmtRow).join('\n') : '  (none)'}

>>> PAID-LIFT CANDIDATES (high impressions, position 8-30 — bid these to break through to top):
${gapCandidates.length ? gapCandidates.map(fmtRow).join('\n') : '  (none)'}

USE THIS DATA when planning Google Ads campaigns:
  - REMOVE cannibalization-risk queries from the campaign keyword list (or use as negatives)
  - PRIORITIZE paid-lift candidates — Google already shows your site for these, paid will accelerate
  - These are PROVEN intent signals from real users, not heuristics`
}
