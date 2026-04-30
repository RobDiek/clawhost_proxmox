/**
 * GA4 Deep Enrichment — Audiences, Demographics, Funnel, Multi-year seasonality.
 *
 * Extends ga4Enrich.ts with the deeper signals a senior PPC needs:
 *   - Audiences (configured remarketing segments) — retarget targets
 *   - Demographics + Tech (gender / age / device / city) — bid adjustments
 *   - Conversion path / funnel — landing-page optimization signal
 *   - 730d seasonality — IL businesses with strong winter/summer cycles
 *
 * All four use the same Data API as ga4Enrich.ts; we share the property
 * resolution logic (auto-discover via accountSummaries).
 */

interface GoogleTokens {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    scopes?: string[]
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'

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

async function resolveProperty(at: string, siteUrl?: string): Promise<string | null> {
    // Strict brand-root match. NEVER falls back to props[0] — that injects
    // another client's data when our OAuth user is an agency with multiple
    // properties under one Google account.
    try {
        const r = await fetch(`${ADMIN_API}/accountSummaries`, {
            headers: { 'Authorization': `Bearer ${at}` },
            signal: AbortSignal.timeout(15000),
        })
        const j = await r.json() as { accountSummaries?: Array<{ propertySummaries?: Array<{ property?: string; displayName?: string }> }> }
        const props: Array<{ id: string; name: string }> = []
        for (const acc of j.accountSummaries || []) {
            for (const p of acc.propertySummaries || []) {
                if (p.property) props.push({ id: p.property.replace('properties/', ''), name: p.displayName || '' })
            }
        }
        if (props.length === 0 || !siteUrl) return null
        const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
        const brandRoot = host.replace(/^www\./, '').split('.')[0]
        const norm = (s: string) => (s || '').toLowerCase().replace(/[\s_-]/g, '')
        const exact = props.find(p => norm(p.name).includes(brandRoot.replace(/-/g, '')))
        return exact?.id || null
    } catch { return null }
}

async function runReport(at: string, propertyId: string, body: any): Promise<any> {
    const r = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${at}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    })
    return r.json()
}

async function listAudiences(at: string, propertyId: string): Promise<any[]> {
    try {
        const r = await fetch(`${ADMIN_API}/properties/${propertyId}/audiences`, {
            headers: { 'Authorization': `Bearer ${at}` },
            signal: AbortSignal.timeout(15000),
        })
        const j = await r.json() as { audiences?: any[] }
        return j.audiences || []
    } catch { return [] }
}

// ─── Audiences ────────────────────────────────────────────────────────────
export interface GA4AudiencesResult {
    available: boolean
    reason?: string
    propertyId?: string
    audiences: Array<{ name: string; displayName: string; description?: string; membershipDurationDays?: number }>
}

export async function pullGA4Audiences(tokens: GoogleTokens | null | undefined, siteUrl?: string): Promise<GA4AudiencesResult> {
    if (!tokens?.refreshToken) return { available: false, reason: 'Not connected', audiences: [] }
    const at = await refresh(tokens.refreshToken)
    if (!at) return { available: false, reason: 'Token refresh failed', audiences: [] }
    const pid = await resolveProperty(at, siteUrl)
    if (!pid) return { available: false, reason: 'No GA4 property found', audiences: [] }

    const audiences = await listAudiences(at, pid)
    return {
        available: true,
        propertyId: pid,
        audiences: audiences.map((a: any) => ({
            name: a.name || '',
            displayName: a.displayName || '?',
            description: a.description,
            membershipDurationDays: a.membershipDurationDays,
        })),
    }
}

// ─── Demographics + Tech ──────────────────────────────────────────────────
export interface GA4DemographicsResult {
    available: boolean
    reason?: string
    daysAnalyzed: number
    byGender: Array<{ gender: string; users: number; conversions: number }>
    byAge: Array<{ ageBracket: string; users: number; conversions: number }>
    byDevice: Array<{ device: string; users: number; conversions: number; conversionRate: number }>
    byCity: Array<{ city: string; users: number; conversions: number }>
}

export async function pullGA4Demographics(tokens: GoogleTokens | null | undefined, siteUrl?: string, days = 365): Promise<GA4DemographicsResult> {
    const empty: GA4DemographicsResult = { available: false, daysAnalyzed: 0, byGender: [], byAge: [], byDevice: [], byCity: [] }
    if (!tokens?.refreshToken) return { ...empty, reason: 'Not connected' }
    const at = await refresh(tokens.refreshToken)
    if (!at) return { ...empty, reason: 'Token refresh failed' }
    const pid = await resolveProperty(at, siteUrl)
    if (!pid) return { ...empty, reason: 'No GA4 property found' }

    const startDate = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
    const endDate = new Date().toISOString().slice(0, 10)
    const dr = [{ startDate, endDate }]

    try {
        const [genderJ, ageJ, deviceJ, cityJ] = await Promise.all([
            runReport(at, pid, { dateRanges: dr, dimensions: [{ name: 'userGender' }], metrics: [{ name: 'totalUsers' }, { name: 'conversions' }], limit: 5 }),
            runReport(at, pid, { dateRanges: dr, dimensions: [{ name: 'userAgeBracket' }], metrics: [{ name: 'totalUsers' }, { name: 'conversions' }], limit: 10 }),
            runReport(at, pid, { dateRanges: dr, dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'totalUsers' }, { name: 'conversions' }, { name: 'sessions' }], limit: 10 }),
            runReport(at, pid, { dateRanges: dr, dimensions: [{ name: 'city' }], metrics: [{ name: 'totalUsers' }, { name: 'conversions' }], limit: 20 }),
        ])
        const parseRows = (j: any): any[] => (j.rows || []).map((r: any) => ({
            dim: r.dimensionValues?.[0]?.value || '?',
            users: parseInt(r.metricValues?.[0]?.value || '0', 10),
            conv: parseFloat(r.metricValues?.[1]?.value || '0'),
            sessions: parseInt(r.metricValues?.[2]?.value || '0', 10),
        }))
        const gen = parseRows(genderJ)
        const age = parseRows(ageJ)
        const dev = parseRows(deviceJ)
        const city = parseRows(cityJ)

        return {
            available: true, daysAnalyzed: days,
            byGender: gen.map(r => ({ gender: r.dim, users: r.users, conversions: Math.round(r.conv * 10) / 10 })),
            byAge: age.map(r => ({ ageBracket: r.dim, users: r.users, conversions: Math.round(r.conv * 10) / 10 })),
            byDevice: dev.map(r => ({ device: r.dim, users: r.users, conversions: Math.round(r.conv * 10) / 10, conversionRate: r.users > 0 ? Math.round((r.conv / r.users) * 1000) / 10 : 0 })),
            byCity: city.slice(0, 15).map(r => ({ city: r.dim, users: r.users, conversions: Math.round(r.conv * 10) / 10 })),
        }
    } catch (err) {
        return { ...empty, reason: `Demographics fetch failed: ${(err as Error).message}` }
    }
}

// ─── Funnel / Conversion paths ────────────────────────────────────────────
export interface GA4FunnelResult {
    available: boolean
    reason?: string
    daysAnalyzed: number
    byLandingPage: Array<{ landingPage: string; sessions: number; conversions: number; conversionRate: number; bounceRate: number }>
    bySource: Array<{ source: string; medium: string; sessions: number; conversions: number; conversionRate: number }>
}

export async function pullGA4Funnel(tokens: GoogleTokens | null | undefined, siteUrl?: string, days = 90): Promise<GA4FunnelResult> {
    const empty: GA4FunnelResult = { available: false, daysAnalyzed: 0, byLandingPage: [], bySource: [] }
    if (!tokens?.refreshToken) return { ...empty, reason: 'Not connected' }
    const at = await refresh(tokens.refreshToken)
    if (!at) return { ...empty, reason: 'Token refresh failed' }
    const pid = await resolveProperty(at, siteUrl)
    if (!pid) return { ...empty, reason: 'No GA4 property found' }

    const startDate = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
    const endDate = new Date().toISOString().slice(0, 10)
    const dr = [{ startDate, endDate }]

    try {
        const [lpJ, srcJ] = await Promise.all([
            runReport(at, pid, {
                dateRanges: dr,
                dimensions: [{ name: 'landingPage' }],
                metrics: [{ name: 'sessions' }, { name: 'conversions' }, { name: 'bounceRate' }],
                limit: 25,
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            }),
            runReport(at, pid, {
                dateRanges: dr,
                dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
                metrics: [{ name: 'sessions' }, { name: 'conversions' }],
                limit: 25,
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            }),
        ])
        const byLandingPage = (lpJ.rows || []).map((r: any) => {
            const lp = r.dimensionValues?.[0]?.value || '?'
            const ses = parseInt(r.metricValues?.[0]?.value || '0', 10)
            const conv = parseFloat(r.metricValues?.[1]?.value || '0')
            const bounce = parseFloat(r.metricValues?.[2]?.value || '0')
            return {
                landingPage: lp,
                sessions: ses,
                conversions: Math.round(conv * 10) / 10,
                conversionRate: ses > 0 ? Math.round((conv / ses) * 1000) / 10 : 0,
                bounceRate: Math.round(bounce * 1000) / 10,
            }
        })
        const bySource = (srcJ.rows || []).map((r: any) => {
            const src = r.dimensionValues?.[0]?.value || '?'
            const med = r.dimensionValues?.[1]?.value || '?'
            const ses = parseInt(r.metricValues?.[0]?.value || '0', 10)
            const conv = parseFloat(r.metricValues?.[1]?.value || '0')
            return {
                source: src, medium: med,
                sessions: ses,
                conversions: Math.round(conv * 10) / 10,
                conversionRate: ses > 0 ? Math.round((conv / ses) * 1000) / 10 : 0,
            }
        })

        return { available: true, daysAnalyzed: days, byLandingPage, bySource }
    } catch (err) {
        return { ...empty, reason: `Funnel fetch failed: ${(err as Error).message}` }
    }
}

// ─── Multi-year seasonality ───────────────────────────────────────────────
export interface GA4SeasonalityResult {
    available: boolean
    reason?: string
    daysAnalyzed: number
    monthly: Array<{ year: number; month: number; sessions: number; conversions: number }>
    seasonalIndex: Array<{ month: number; conversionMultiplier: number }>  // 1.0 = avg; > 1 = peak
}

export async function pullGA4Seasonality(tokens: GoogleTokens | null | undefined, siteUrl?: string, days = 730): Promise<GA4SeasonalityResult> {
    const empty: GA4SeasonalityResult = { available: false, daysAnalyzed: 0, monthly: [], seasonalIndex: [] }
    if (!tokens?.refreshToken) return { ...empty, reason: 'Not connected' }
    const at = await refresh(tokens.refreshToken)
    if (!at) return { ...empty, reason: 'Token refresh failed' }
    const pid = await resolveProperty(at, siteUrl)
    if (!pid) return { ...empty, reason: 'No GA4 property found' }

    const startDate = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
    const endDate = new Date().toISOString().slice(0, 10)
    const dr = [{ startDate, endDate }]

    try {
        const j = await runReport(at, pid, {
            dateRanges: dr,
            dimensions: [{ name: 'yearMonth' }],
            metrics: [{ name: 'sessions' }, { name: 'conversions' }],
            limit: 30,
        })
        const rows = (j.rows || []).map((r: any) => {
            const ym = r.dimensionValues?.[0]?.value || '202401'
            const year = parseInt(ym.slice(0, 4), 10)
            const month = parseInt(ym.slice(4, 6), 10)
            const sessions = parseInt(r.metricValues?.[0]?.value || '0', 10)
            const conversions = parseFloat(r.metricValues?.[1]?.value || '0')
            return { year, month, sessions, conversions: Math.round(conversions * 10) / 10 }
        }).sort((a: any, b: any) => (a.year * 12 + a.month) - (b.year * 12 + b.month))

        // Compute seasonal index — average conv per calendar month vs overall avg
        const byMonth = new Map<number, { total: number; n: number }>()
        for (const r of rows) {
            const cur = byMonth.get(r.month) || { total: 0, n: 0 }
            cur.total += r.conversions; cur.n++
            byMonth.set(r.month, cur)
        }
        const overallAvg = rows.length > 0 ? rows.reduce((s, r) => s + r.conversions, 0) / rows.length : 0
        const seasonalIndex = [...byMonth.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([month, v]) => ({
                month,
                conversionMultiplier: overallAvg > 0 ? Math.round((v.total / v.n) / overallAvg * 100) / 100 : 1.0,
            }))

        return { available: true, daysAnalyzed: days, monthly: rows, seasonalIndex }
    } catch (err) {
        return { ...empty, reason: `Seasonality fetch failed: ${(err as Error).message}` }
    }
}

// ─── Renderers ────────────────────────────────────────────────────────────

export function renderGA4AudiencesContext(r: GA4AudiencesResult): string {
    if (!r.available) return `═══ GA4 AUDIENCES ═══\n\n(${r.reason || 'unavailable'})`
    if (r.audiences.length === 0) return `═══ GA4 AUDIENCES ═══\n\nNo audiences configured. Recommend creating: cart_abandoners (7d), engaged_users (30d), purchasers (90d) for remarketing.`
    const list = r.audiences.slice(0, 15).map(a => `  ${a.displayName.padEnd(30)}${a.description ? ' — ' + a.description.slice(0, 80) : ''}`).join('\n')
    return `═══ GA4 AUDIENCES (already configured by client) ═══

${list}

USE THIS DATA:
- These segments are READY for Google Ads remarketing — link them via GA4 → Ads sharing.
- Do NOT recommend "create new audiences"; recommend ACTIVATING the existing ones.`
}

export function renderGA4DemographicsContext(r: GA4DemographicsResult): string {
    if (!r.available) return `═══ GA4 DEMOGRAPHICS + TECH ═══\n\n(${r.reason || 'unavailable'})`
    const dev = r.byDevice.map(d => `  ${d.device.padEnd(10)} | users=${d.users}, conv=${d.conversions}, CR=${d.conversionRate}%`).join('\n')
    const age = r.byAge.slice(0, 6).map(a => `  ${a.ageBracket.padEnd(10)} | users=${a.users}, conv=${a.conversions}`).join('\n')
    const cities = r.byCity.slice(0, 8).map(c => `  ${c.city.padEnd(20)} | users=${c.users}, conv=${c.conversions}`).join('\n')
    return `═══ GA4 DEMOGRAPHICS + TECH (last ${r.daysAnalyzed} days) ═══

By device (most actionable for bid adjustments):
${dev || '  (no data)'}

By age bracket:
${age || '  (no data)'}

Top cities by conversions:
${cities || '  (no data)'}

USE THIS DATA:
- Best-converting device → set positive bid adjustment (+15-30%)
- Worst-converting device → negative adjustment (-30 to -50%) or campaign exclusion
- Top cities → location bid adjustments OR new tightly-targeted campaign
- Age skew → audience targeting / RLSA segmentation (don't waste budget on outliers)`
}

export function renderGA4FunnelContext(r: GA4FunnelResult): string {
    if (!r.available) return `═══ GA4 FUNNEL / LANDING PAGES ═══\n\n(${r.reason || 'unavailable'})`
    const lp = r.byLandingPage.slice(0, 10).map(p => `  ${p.landingPage.padEnd(40).slice(0, 40)} | ses=${p.sessions}, conv=${p.conversions}, CR=${p.conversionRate}%, bounce=${p.bounceRate}%`).join('\n')
    const src = r.bySource.slice(0, 10).map(s => `  ${(s.source + '/' + s.medium).padEnd(30)} | ses=${s.sessions}, conv=${s.conversions}, CR=${s.conversionRate}%`).join('\n')
    return `═══ GA4 FUNNEL — LANDING PAGES + SOURCES (last ${r.daysAnalyzed} days) ═══

Top landing pages by sessions:
${lp || '  (no data)'}

Top sources/mediums:
${src || '  (no data)'}

USE THIS DATA:
- Highest-CR landing pages → use as finalUrl for Search campaigns
- Pages with high bounce + low CR → flag as "fix landing page first" recommendation
- Source/medium with high CR but low sessions → opportunity to scale via paid amplification`
}

export function renderGA4SeasonalityContext(r: GA4SeasonalityResult): string {
    if (!r.available) return `═══ GA4 SEASONALITY ═══\n\n(${r.reason || 'unavailable'})`
    if (r.monthly.length < 6) return `═══ GA4 SEASONALITY ═══\n\nNot enough history (${r.monthly.length} months) — need 12+ for seasonal pattern.`
    const idx = r.seasonalIndex.map(s => `  ${String(s.month).padStart(2, '0')}: ${'█'.repeat(Math.round(s.conversionMultiplier * 8))} ${s.conversionMultiplier}x`).join('\n')
    const peakMonths = r.seasonalIndex.filter(s => s.conversionMultiplier > 1.2).map(s => `${s.month}`).join(', ')
    const lowMonths = r.seasonalIndex.filter(s => s.conversionMultiplier < 0.8).map(s => `${s.month}`).join(', ')
    return `═══ GA4 SEASONALITY (last ${Math.round(r.daysAnalyzed / 30)} months) ═══

Conversion multiplier by calendar month (1.0 = average):
${idx}

Peak months (>1.2× avg): ${peakMonths || '(none — flat)'}
Low months  (<0.8× avg): ${lowMonths || '(none — flat)'}

USE THIS DATA:
- Increase budget +30-50% during peak months
- Reduce or pause aggressive bidding during low months
- Plan creative refreshes timed to ramp-up (T-2 weeks before peak)
- Don't trust month-1 of campaign data if launched in a peak/low month — set expectations accordingly`
}
