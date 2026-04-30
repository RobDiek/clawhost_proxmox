/**
 * GSC Pages report — landing-page level organic ranking signal.
 *
 * Complements gscEnrich.ts (queries) with the page-level view, so Mazhir can:
 *   - identify pages that ALREADY rank well organically and recommend their
 *     URLs as paid finalUrl (better Quality Score)
 *   - flag pages with high impressions but low CTR (snippet/title issue)
 *   - avoid paid keywords whose corresponding LP is invisible on organic
 *     (signal of a content quality gap)
 *
 * Reuses the OAuth refresh token + scope already granted in gscEnrich.ts.
 */

interface GoogleTokens {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    scopes?: string[]
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SC_API = 'https://searchconsole.googleapis.com/webmasters/v3'

async function refresh(rt: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || ''
    const csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec) return null
    try {
        const r = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' }),
        })
        const j = await r.json() as { access_token?: string }
        return j.access_token || null
    } catch { return null }
}

export interface GSCPagesResult {
    available: boolean
    reason?: string
    daysAnalyzed: number
    pages: Array<{ page: string; impressions: number; clicks: number; ctr: number; position: number }>
    topRankingPages: Array<{ page: string; position: number; clicks: number }>
    underperformingPages: Array<{ page: string; impressions: number; ctr: number; position: number }>
}

export async function pullGSCPages(tokens: GoogleTokens | null | undefined, siteUrl?: string, days = 90): Promise<GSCPagesResult> {
    const empty: GSCPagesResult = { available: false, daysAnalyzed: 0, pages: [], topRankingPages: [], underperformingPages: [] }
    if (!tokens?.refreshToken) return { ...empty, reason: 'GSC not connected' }
    // GSC may use its own OAuth integration where tokens.scopes is omitted
    // entirely (the webmasters scope was implicit at connect time, hence the
    // refreshToken IS the webmasters one). Only block if scopes is provided
    // AND clearly missing search console.
    const { normalizeGoogleScopes } = await import('./googleScopes')
    if (Array.isArray(tokens.scopes) && tokens.scopes.length > 0 && !normalizeGoogleScopes(tokens.scopes).searchConsole) {
        return { ...empty, reason: 'Missing webmasters OAuth scope' }
    }
    const at = await refresh(tokens.refreshToken)
    if (!at) return { ...empty, reason: 'Token refresh failed' }

    try {
        // Find best-matching verified site. GSC has TWO property types:
        //   - URL-prefix: "https://storage4you.co.il/"
        //   - Domain:     "sc-domain:storage4you.co.il"
        // Each is a separate property — querying the wrong one returns 403.
        // We list all sites for this user, pick the one matching brand root,
        // preferring sc-domain (covers all subdomains/protocols).
        const sl = await fetch(`${SC_API}/sites`, { headers: { 'Authorization': `Bearer ${at}` }, signal: AbortSignal.timeout(15000) })
        const slJ = await sl.json() as { siteEntry?: Array<{ siteUrl: string; permissionLevel?: string }> }
        const all = (slJ.siteEntry || []).filter(s => s.permissionLevel && s.permissionLevel !== 'siteUnverifiedUser')
        let site = ''
        if (siteUrl) {
            const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase().replace(/^www\./, '')
            const brand = host.split('.')[0]
            // 1. Exact sc-domain match
            const domain = all.find(s => s.siteUrl === `sc-domain:${host}`)
            // 2. URL-prefix match (any protocol/path)
            const prefix = all.find(s => s.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase() === host)
            // 3. Brand-root match in any verified property
            const brandMatch = all.find(s => s.siteUrl.toLowerCase().includes(brand))
            site = domain?.siteUrl || prefix?.siteUrl || brandMatch?.siteUrl || ''
        }
        if (!site && all.length === 1) site = all[0].siteUrl
        if (!site) return { ...empty, reason: `No verified GSC site matches "${siteUrl}". Verified: [${all.map(s => s.siteUrl).join(', ')}]` }

        const startDate = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
        const endDate = new Date().toISOString().slice(0, 10)
        const url = `${SC_API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${at}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate, dimensions: ['page'], rowLimit: 100, dataState: 'all' }),
            signal: AbortSignal.timeout(30000),
        })
        if (!r.ok) {
            const t = await r.text().catch(() => '')
            return { ...empty, reason: `GSC API ${r.status}: ${t.slice(0, 120)}` }
        }
        const j = await r.json() as { rows?: Array<{ keys?: string[]; impressions: number; clicks: number; ctr: number; position: number }> }
        const rows = (j.rows || []).map(x => ({
            page: x.keys?.[0] || '?',
            impressions: x.impressions || 0,
            clicks: x.clicks || 0,
            ctr: Math.round((x.ctr || 0) * 1000) / 10,
            position: Math.round((x.position || 0) * 10) / 10,
        }))

        const topRanking = rows.filter(p => p.position <= 5 && p.impressions > 50).sort((a, b) => b.clicks - a.clicks).slice(0, 10).map(p => ({ page: p.page, position: p.position, clicks: p.clicks }))
        const under = rows.filter(p => p.impressions > 100 && p.ctr < 1.5).sort((a, b) => b.impressions - a.impressions).slice(0, 10).map(p => ({ page: p.page, impressions: p.impressions, ctr: p.ctr, position: p.position }))

        return { available: true, daysAnalyzed: days, pages: rows.slice(0, 50), topRankingPages: topRanking, underperformingPages: under }
    } catch (err) {
        return { ...empty, reason: `GSC pages fetch failed: ${(err as Error).message}` }
    }
}

export function renderGSCPagesContext(r: GSCPagesResult): string {
    if (!r.available) return `═══ SEARCH CONSOLE — PAGES ═══\n\n(${r.reason || 'unavailable'})`
    if (r.pages.length === 0) return `═══ SEARCH CONSOLE — PAGES ═══\n\nNo organic page data — site may be too new.`
    const top = r.topRankingPages.slice(0, 6).map(p => `  ${p.page} — pos ${p.position}, ${p.clicks} clicks`).join('\n')
    const under = r.underperformingPages.slice(0, 6).map(p => `  ${p.page} — ${p.impressions} impr, ${p.ctr}% CTR, pos ${p.position}`).join('\n')
    return `═══ SEARCH CONSOLE — PAGES (last ${r.daysAnalyzed} days) ═══

Top organically-ranking pages (use as paid finalUrl candidates):
${top || '  (none ranking top 5)'}

Underperforming (high impressions, low CTR — title/snippet issue):
${under || '  (none)'}

USE THIS DATA:
- Top organic pages → recommend as paid Search campaign finalUrl (better QS)
- Underperforming pages → don't use as paid LP without title/meta fix
- Pages absent here → invisible on organic; if used as paid LP, flag as content gap`
}
