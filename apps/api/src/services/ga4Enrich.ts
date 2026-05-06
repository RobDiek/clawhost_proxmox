// Google Analytics 4 Data API enrichment for Mazhir audit + media plan.
//
// Pulls REAL conversion event counts from GA4 — bypasses the "0 conversions
// in Google Ads CSV" trap (where past campaigns ran without native pixel but
// GA4 was tracking events all along).
//
// Uses analyticsdata.googleapis.com (Data API v1beta) with OAuth refresh
// token. Auto-discovers property ID from googleTokens or via management API.

interface GA4EventCount {
    eventName: string
    eventCount: number
}

interface GA4Result {
    available: boolean
    reason?: string
    propertyId?: string
    daysAnalyzed: number
    totalConversions: number
    events: GA4EventCount[]
    estimatedConversionRatePct?: number
    sessionCount?: number
}

interface GoogleTokens {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    scopes?: string[]
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
        const j = await res.json() as { access_token?: string }
        return j.access_token || null
    } catch { return null }
}

// List the user's GA4 properties via Admin API to find the right one.
async function listGA4Properties(accessToken: string): Promise<Array<{ propertyId: string; displayName: string; websiteUrl?: string }>> {
    try {
        // First list account summaries (returns properties grouped by account)
        const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(15_000),
        })
        const j = await res.json() as { accountSummaries?: Array<{ propertySummaries?: Array<{ property?: string; displayName?: string }> }> }
        const out: Array<{ propertyId: string; displayName: string }> = []
        for (const acc of j.accountSummaries || []) {
            for (const p of acc.propertySummaries || []) {
                if (p.property) {
                    out.push({
                        propertyId: p.property.replace('properties/', ''),
                        displayName: p.displayName || p.property,
                    })
                }
            }
        }
        return out
    } catch {
        return []
    }
}

export async function enrichWithGA4(
    googleTokens: GoogleTokens | null | undefined,
    options: { days?: number; propertyId?: string; siteUrl?: string } = {},
): Promise<GA4Result> {
    if (!googleTokens?.refreshToken) {
        return { available: false, reason: 'GA4 not connected (no refresh token)', daysAnalyzed: 0, totalConversions: 0, events: [] }
    }
    const { normalizeGoogleScopes } = await import('./googleScopes')
    if (!normalizeGoogleScopes(googleTokens.scopes).analytics) {
        return { available: false, reason: 'Missing analytics OAuth scope', daysAnalyzed: 0, totalConversions: 0, events: [] }
    }

    const days = options.days ?? 365
    const accessToken = (googleTokens.expiresAt && googleTokens.expiresAt > Date.now() && googleTokens.accessToken)
        ? googleTokens.accessToken
        : await refreshGoogleAccessToken(googleTokens.refreshToken)
    if (!accessToken) {
        return { available: false, reason: 'Could not refresh GA4 token', daysAnalyzed: days, totalConversions: 0, events: [] }
    }

    // Resolve property: explicit > brand-root match > REFUSE.
    //
    // CRITICAL: an agency OAuth user often has access to many properties
    // belonging to OTHER clients (Zing Music, FlowMatic, etc). Picking
    // properties[0] when no exact match exists silently injects another
    // client's data into the audit. Refuse and surface as failure instead.
    let propertyId = options.propertyId
    let matchReason = 'explicit propertyId from caller'
    if (!propertyId) {
        const props = await listGA4Properties(accessToken)
        if (props.length === 0) {
            return { available: false, reason: 'No GA4 properties accessible to this user', daysAnalyzed: days, totalConversions: 0, events: [] }
        }
        if (!options.siteUrl) {
            return { available: false, reason: `${props.length} properties accessible but no siteUrl hint to disambiguate. Configure mazhirGa4PropertyId on the instance.`, daysAnalyzed: days, totalConversions: 0, events: [] }
        }
        // Brand-root match: extract base brand from siteUrl ("storage4you.co.il" → "storage4you"),
        // then match property displayName ignoring whitespace and case.
        const host = options.siteUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
        const brandRoot = host.replace(/^www\./, '').split('.')[0]   // "storage4you"
        const norm = (s: string) => (s || '').toLowerCase().replace(/[\s_-]/g, '')
        const exact = props.find(p => norm(p.displayName).includes(brandRoot.replace(/-/g, '')))
        if (!exact) {
            const allNames = props.map(p => p.displayName).join(', ')
            return {
                available: false,
                reason: `No GA4 property matches brand "${brandRoot}". Accessible: [${allNames}]. To resolve, set mazhirGa4PropertyId on the instance.`,
                daysAnalyzed: days, totalConversions: 0, events: [],
            }
        }
        propertyId = exact.propertyId
        matchReason = `matched "${exact.displayName}" against brand root "${brandRoot}"`
    }

    const endDate = new Date()
    const startDate = new Date(Date.now() - days * 24 * 3600 * 1000)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    try {
        // Pull two reports in parallel: events with conversion=true, total sessions
        const [eventsRes, sessionsRes] = await Promise.all([
            fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
                    dimensions: [{ name: 'eventName' }],
                    metrics: [{ name: 'eventCount' }, { name: 'conversions' }],
                    // Filter to events that are typical lead conversions or marked as conversion in GA4
                    dimensionFilter: {
                        orGroup: {
                            expressions: [
                                { filter: { fieldName: 'eventName', stringFilter: { matchType: 'CONTAINS', value: 'lead' } } },
                                { filter: { fieldName: 'eventName', stringFilter: { matchType: 'CONTAINS', value: 'submit' } } },
                                { filter: { fieldName: 'eventName', stringFilter: { matchType: 'CONTAINS', value: 'contact' } } },
                                { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'form_submit' } } },
                                { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'generate_lead' } } },
                                { filter: { fieldName: 'eventName', stringFilter: { matchType: 'CONTAINS', value: 'phone' } } },
                                { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'purchase' } } },
                                { filter: { fieldName: 'eventName', stringFilter: { matchType: 'CONTAINS', value: 'whatsapp' } } },
                            ],
                        },
                    },
                    limit: 50,
                }),
                signal: AbortSignal.timeout(30_000),
            }),
            fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
                    metrics: [{ name: 'sessions' }],
                }),
                signal: AbortSignal.timeout(30_000),
            }),
        ])
        const eventsJson = await eventsRes.json() as { rows?: Array<{ dimensionValues?: Array<{ value: string }>; metricValues?: Array<{ value: string }> }>; error?: { message?: string } }
        const sessionsJson = await sessionsRes.json() as { rows?: Array<{ metricValues?: Array<{ value: string }> }>; error?: { message?: string } }
        if (eventsJson.error) {
            return { available: false, reason: `GA4 API: ${eventsJson.error.message}`, daysAnalyzed: days, totalConversions: 0, events: [], propertyId }
        }
        const events: GA4EventCount[] = (eventsJson.rows || []).map(r => ({
            eventName: r.dimensionValues?.[0]?.value || '?',
            eventCount: parseInt(r.metricValues?.[0]?.value || '0', 10) || 0,
        }))
        const totalConversions = events.reduce((sum, e) => sum + e.eventCount, 0)
        const sessionCount = parseInt(sessionsJson.rows?.[0]?.metricValues?.[0]?.value || '0', 10) || 0
        const estimatedConversionRatePct = sessionCount > 0
            ? Math.round((totalConversions / sessionCount) * 1000) / 10
            : undefined

        return {
            available: true,
            propertyId,
            daysAnalyzed: days,
            totalConversions,
            events: events.sort((a, b) => b.eventCount - a.eventCount),
            estimatedConversionRatePct,
            sessionCount,
        }
    } catch (err) {
        return { available: false, reason: `GA4 fetch failed: ${(err as Error).message}`, daysAnalyzed: days, totalConversions: 0, events: [], propertyId }
    }
}

export function renderGA4Context(r: GA4Result): string {
    if (!r.available || r.totalConversions === 0) {
        return `═══ GOOGLE ANALYTICS 4 — REAL CONVERSION EVENTS ═══\n\n(${r.reason || 'no conversion events tracked'})`
    }
    const rows = r.events.slice(0, 20).map(e => `  ${e.eventName.padEnd(30)} | count=${e.eventCount.toString().padStart(6)}`).join('\n')
    const cvr = r.estimatedConversionRatePct != null ? `~${r.estimatedConversionRatePct}%` : '?'
    return `═══ GOOGLE ANALYTICS 4 — REAL CONVERSION EVENTS (last ${r.daysAnalyzed} days, property ${r.propertyId}) ═══

CRITICAL — these are REAL events from GA4 over the analyzed period.
This OVERRIDES "0 conversions" any campaign-overview CSV may show; the
old Google Ads campaign didn't have a native pixel installed, but GA4
WAS tracking events the entire time.

Total conversion events: ${r.totalConversions}
Total sessions: ${r.sessionCount ?? '?'}
Estimated conversion rate (events/sessions): ${cvr}

Event breakdown:
${rows}

USE THIS DATA:
  - For tCPA / ROI math, treat totalConversions as the REAL conversion count for the analyzed period.
  - Compute monthly run-rate: totalConversions / (daysAnalyzed/30).
  - If a previous Google Ads campaign reported 0 conversions in CSVs, EXPLICITLY flag the gap as
    "tracking infrastructure failure (GA4 was working, native pixel was not)" rather than "campaign failure".
  - Ground tCPA recommendations in the GA4 reality: typical lead value × recoverable margin.`
}