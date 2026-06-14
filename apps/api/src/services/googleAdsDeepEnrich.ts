/**
 * Google Ads — Deep account-level enrichment for Mazhir audit.
 *
 * Pulls the data sources a senior PPC consultant would always check before
 * giving advice but that the existing googleAds.ts service didn't expose:
 *
 *   1. Search Terms Report (SQR) — n-gram waste analysis (real, not guessed)
 *   2. Auction Insights — competitive overlap, impression share
 *   3. Change History — who broke what, when, explains historical drops
 *   4. Quality Score — keyword-level diagnostic distribution
 *
 * All four short-circuit gracefully when account isn't connected, returning
 * `{ available: false, reason }` so renderers can show plain-Hebrew badges.
 *
 * NOTE: All four require the Google Ads API + a developer token. Enterprise-tier
 * customers usually have Standard access; basic-access tokens see SQR with
 * limits. We catch errors per-source and surface them in sourceCoverage rather
 * than letting them sink the whole audit.
 */

interface GoogleTokens {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    scopes?: string[]
    email?: string
}

// Google Ads API version. v18 was deprecated and returns 404 as of early 2026;
// v22 is the latest stable (released Feb 2026, supported through ~Dec 2026).
// Bump when Google deprecates v22 — they typically maintain 3 versions concurrently.
const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v22'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

async function refreshAccessToken(refresh: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || ''
    const csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec) return null
    try {
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: refresh, grant_type: 'refresh_token' }),
        })
        const j = await res.json() as { access_token?: string }
        return j.access_token || null
    } catch { return null }
}

async function gaqlQuery(
    customerId: string,
    accessToken: string,
    query: string,
    developerToken: string,
    loginCustomerId?: string,
): Promise<any[]> {
    if (!developerToken) {
        throw new Error('Ads API: developer-token missing — pass per-tenant token from googleAdsConfig')
    }
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': developerToken,
    }
    // Only set login-customer-id when it differs from the operating customer.
    // For direct accounts (no MCC), sending it equal to customerId is unnecessary
    // and historically caused subtle auth failures in some API versions.
    if (loginCustomerId && loginCustomerId !== customerId) {
        headers['login-customer-id'] = loginCustomerId
    }

    const url = `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:searchStream`
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(60_000),
    })

    // Detect HTML response (API version 404 / proxy error) BEFORE attempting JSON parse
    // — the JSON parser error would otherwise leak a confusing "Unexpected token '<'"
    // message to the UI instead of a meaningful diagnostic.
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
        const txt = await res.text()
        throw new Error(`Ads API ${res.status}: non-JSON response (likely API version deprecated): ${txt.slice(0, 200).replace(/\s+/g, ' ')}`)
    }

    const data = await res.json() as any
    if (!res.ok) {
        throw new Error(`Ads API ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
    }
    const out: any[] = []
    if (Array.isArray(data)) {
        for (const batch of data) {
            if (batch.results) out.push(...batch.results)
        }
    }
    return out
}

// ─── Campaign-scope filtering (Phase 4.2.1) ──────────────────────────────
// Many users connect a Google Ads account that hosts campaigns belonging to
// multiple businesses (the user's own agency / freelance work, etc.). We must
// only consume data for the campaigns that belong to THIS instance — otherwise
// SQR, Auction Insights, and Change History bleed unrelated client data into
// our research. CampaignScope is the allowlist surface exposed by
// `instances.google_ads_config.scope` and applied to every GAQL query.

export interface CampaignScope {
    mode: 'account' | 'campaigns'
    /** Sub-account ID under an MCC. When set, queries hit this account; loginCustomerId stays as MCC. */
    operatingCustomerId?: string
    campaignIds?: string[]            // resource IDs (numeric strings) — applied if mode='campaigns'
}

// Builds `AND campaign.id IN (...)` fragment when scope narrows to campaigns.
// Returns empty string for account-wide mode.
function scopeClause(scope: CampaignScope | undefined): string {
    if (!scope || scope.mode === 'account') return ''
    const ids = (scope.campaignIds || []).filter(id => /^\d+$/.test(id))
    if (ids.length === 0) {
        // Defensive: empty allowlist + 'campaigns' mode = zero data
        // (this matches user intent: "I haven't picked yet" should not leak)
        return ' AND campaign.id = 0'
    }
    return ` AND campaign.id IN (${ids.join(',')})`
}

// ─── Campaign Picker — MCC-aware, two-step (sub-account → campaigns) ─────
//
// Many Google Ads connections are MCCs (manager accounts) that contain
// sub-accounts for multiple businesses. You CANNOT request metrics from an MCC
// (REQUESTED_METRICS_FOR_MANAGER error). The picker handles this two-step:
//
//   1. listCampaigns(mccId) → returns { kind:'sub_accounts', subAccounts:[...] }
//   2. listCampaigns(mccId, subAccountId) → returns { kind:'campaigns', campaigns:[...] }
//
// Both use the MCC as the login-customer-id header; the URL path is either the
// MCC (for customer_client query) or the sub-account (for campaign query).
//
// For single-tenant accounts (no MCC), step 1 already returns campaigns
// directly — the picker UI just skips the sub-account step.

export interface CampaignSummary {
    id: string                     // numeric ID (string, since GAQL returns int64)
    name: string
    status: 'ENABLED' | 'PAUSED' | 'REMOVED' | 'UNKNOWN'
    advertisingChannelType: string // SEARCH | DISPLAY | VIDEO | SHOPPING | PERFORMANCE_MAX | ...
    last30dSpendIls: number
    last30dClicks: number
    last30dConversions: number
    last30dImpressions: number
    startDate?: string
    endDate?: string
}

export interface SubAccountSummary {
    id: string                     // customer ID of the sub-account
    descriptiveName: string        // human-readable
    currencyCode?: string
    timeZone?: string
    status: 'ENABLED' | 'CANCELED' | 'SUSPENDED' | 'CLOSED' | 'UNKNOWN'
}

export interface CampaignListResult {
    available: boolean
    reason?: string
    /** 'campaigns' = direct list. 'sub_accounts' = MCC — must pick sub-account first. */
    kind?: 'campaigns' | 'sub_accounts'
    customerId?: string
    operatingCustomerId?: string   // which sub-account these campaigns belong to (if kind='campaigns' under MCC)
    accountCurrency?: string
    campaigns: CampaignSummary[]
    subAccounts?: SubAccountSummary[]
}

export async function listCampaigns(
    customerId: string | undefined,         // could be MCC (top-level) — used as login-customer-id
    tokens: GoogleTokens | null | undefined,
    developerToken: string | undefined,
    loginCustomerId?: string,
    operatingCustomerId?: string,           // if set + customerId is MCC → query this sub-account
): Promise<CampaignListResult> {
    if (!customerId || !tokens?.refreshToken) {
        return { available: false, reason: 'Account not connected', campaigns: [] }
    }
    if (!developerToken) {
        return { available: false, reason: 'Developer Token חסר', campaigns: [] }
    }
    const at = await refreshAccessToken(tokens.refreshToken)
    if (!at) return { available: false, reason: 'Token refresh failed', campaigns: [] }

    // login-customer-id header is the MCC. customerId path is the operating
    // account. When operatingCustomerId is supplied, that's the sub-account to
    // query; otherwise we're querying customerId directly (which may itself be
    // the operating account OR may be an MCC — we'll detect the MCC case).
    const loginHeader = loginCustomerId || customerId
    const queryTarget = operatingCustomerId || customerId

    // ─── TEMP DIAGNOSTIC (remove after resolving USER_PERMISSION_DENIED) ──
    // Logs the exact params + what the OAuth user can actually reach, so a
    // persistent 403 can be pinned to: wrong OAuth account, MCC not set, or
    // operating account not linked under the dev-token's MCC.
    console.log(`[ads-diag] queryTarget=${queryTarget} loginHeader=${loginHeader} devToken=…${(developerToken || '').slice(-6)}`)
    try {
        const accRes = await fetch('https://googleads.googleapis.com/v22/customers:listAccessibleCustomers', {
            headers: { Authorization: `Bearer ${at}`, 'developer-token': developerToken },
            signal: AbortSignal.timeout(30000),
        })
        const accBody = await accRes.text()
        console.log(`[ads-diag] listAccessibleCustomers status=${accRes.status} body=${accBody.slice(0, 600)}`)
    } catch (e) {
        console.log(`[ads-diag] listAccessibleCustomers threw: ${(e as Error).message}`)
    }

    try {
        // Pull all non-removed campaigns + last 30d performance
        const campaignQuery = `
            SELECT
              campaign.id,
              campaign.name,
              campaign.status,
              campaign.advertising_channel_type,
              campaign.start_date,
              campaign.end_date,
              metrics.cost_micros,
              metrics.clicks,
              metrics.conversions,
              metrics.impressions
            FROM campaign
            WHERE campaign.status != 'REMOVED'
              AND segments.date DURING LAST_30_DAYS
            ORDER BY metrics.cost_micros DESC
            LIMIT 500
        `

        let rows: any[]
        try {
            rows = await gaqlQuery(queryTarget, at, campaignQuery, developerToken, loginHeader)
        } catch (err) {
            const msg = (err as Error).message
            // Detect MCC — pivot to listing sub-accounts. The Google Ads error
            // is `REQUESTED_METRICS_FOR_MANAGER` — return sub-accounts so the
            // UI can prompt user to pick which business is theirs.
            if (msg.includes('REQUESTED_METRICS_FOR_MANAGER') || msg.includes('manager account')) {
                const subRows = await gaqlQuery(queryTarget, at, `
                    SELECT
                      customer_client.id,
                      customer_client.descriptive_name,
                      customer_client.currency_code,
                      customer_client.time_zone,
                      customer_client.status,
                      customer_client.manager,
                      customer_client.level
                    FROM customer_client
                    WHERE customer_client.status != 'CLOSED'
                      AND customer_client.level <= 1
                `, developerToken, loginHeader).catch(() => [])

                const subAccounts: SubAccountSummary[] = subRows
                    .map((r: any) => r?.customerClient || {})
                    .filter((c: any) => c && !c.manager && c.id && String(c.id) !== queryTarget)
                    .map((c: any) => ({
                        id: String(c.id),
                        descriptiveName: c.descriptiveName || `Account ${c.id}`,
                        currencyCode: c.currencyCode,
                        timeZone: c.timeZone,
                        status: (c.status as SubAccountSummary['status']) || 'UNKNOWN',
                    }))

                if (subAccounts.length === 0) {
                    return { available: false, reason: 'MCC account but no accessible sub-accounts found', kind: 'sub_accounts', subAccounts: [], campaigns: [] }
                }
                return { available: true, kind: 'sub_accounts', customerId: queryTarget, subAccounts, campaigns: [] }
            }
            throw err
        }

        const campaigns: CampaignSummary[] = rows.map(r => {
            const c = r?.campaign || {}
            const m = r?.metrics || {}
            return {
                id: String(c.id || ''),
                name: c.name || '?',
                status: (c.status as CampaignSummary['status']) || 'UNKNOWN',
                advertisingChannelType: c.advertisingChannelType || '?',
                last30dSpendIls: Math.round((Number(m.costMicros || 0) / 1_000_000) * 100) / 100,
                last30dClicks: Number(m.clicks || 0),
                last30dConversions: Math.round(Number(m.conversions || 0) * 10) / 10,
                last30dImpressions: Number(m.impressions || 0),
                startDate: c.startDate,
                endDate: c.endDate,
            }
        }).filter(c => !!c.id)

        // Account currency
        let accountCurrency: string | undefined
        try {
            const accRows = await gaqlQuery(queryTarget, at, 'SELECT customer.currency_code FROM customer', developerToken, loginHeader)
            accountCurrency = accRows[0]?.customer?.currencyCode
        } catch { /* non-fatal */ }

        return {
            available: true,
            kind: 'campaigns',
            customerId: queryTarget,
            operatingCustomerId: operatingCustomerId || queryTarget,
            accountCurrency,
            campaigns,
        }
    } catch (err) {
        return { available: false, reason: `Campaign list failed: ${(err as Error).message}`, campaigns: [] }
    }
}

// ─── Search Terms Report ──────────────────────────────────────────────────
export interface SearchTermsResult {
    available: boolean
    reason?: string
    daysAnalyzed: number
    totalTerms: number
    totalSpendIls: number
    wasteByPattern: Array<{ pattern: string; spendIls: number; clicks: number; conversions: number; rationale: string }>
    topConvertingTerms: Array<{ searchTerm: string; clicks: number; conversions: number; cpa: number }>
    estimatedWastedSpendPct: number
}

export async function pullSearchTermsReport(
    customerId: string | undefined,
    tokens: GoogleTokens | null | undefined,
    days = 90,
    scope?: CampaignScope,
    loginCustomerId?: string,
    developerToken?: string,
): Promise<SearchTermsResult> {
    if (!customerId || !tokens?.refreshToken) {
        return { available: false, reason: 'Account not connected', daysAnalyzed: 0, totalTerms: 0, totalSpendIls: 0, wasteByPattern: [], topConvertingTerms: [], estimatedWastedSpendPct: 0 }
    }
    if (!developerToken) {
        return { available: false, reason: 'Developer Token חסר', daysAnalyzed: 0, totalTerms: 0, totalSpendIls: 0, wasteByPattern: [], topConvertingTerms: [], estimatedWastedSpendPct: 0 }
    }
    const at = await refreshAccessToken(tokens.refreshToken)
    if (!at) return { available: false, reason: 'Token refresh failed', daysAnalyzed: 0, totalTerms: 0, totalSpendIls: 0, wasteByPattern: [], topConvertingTerms: [], estimatedWastedSpendPct: 0 }

    try {
        // v22 DURING operator supports only fixed enums (LAST_7_DAYS, LAST_30_DAYS,
        // THIS_MONTH, LAST_MONTH, etc.) — not arbitrary day counts. Use explicit
        // BETWEEN date range to support 90/180-day windows.
        const endDate = new Date()
        const startDate = new Date(endDate.getTime() - days * 24 * 3600 * 1000)
        const dateRange = `BETWEEN '${startDate.toISOString().slice(0, 10)}' AND '${endDate.toISOString().slice(0, 10)}'`

        const query = `
            SELECT
              search_term_view.search_term,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.impressions
            FROM search_term_view
            WHERE segments.date ${dateRange}
              AND metrics.impressions > 0${scopeClause(scope)}
            ORDER BY metrics.cost_micros DESC
            LIMIT 1000
        `
        // When operating under MCC, queryTarget is the sub-account ID; customerId
        // is the MCC and goes only in the login-customer-id header.
        const queryTarget = scope?.operatingCustomerId || customerId
        const loginHeader = loginCustomerId || customerId
        const rows = await gaqlQuery(queryTarget, at, query, developerToken, loginHeader)

        let totalSpend = 0, totalConv = 0, totalClicks = 0
        const terms: Array<{ term: string; clicks: number; cost: number; conv: number }> = []
        for (const r of rows) {
            const term = r?.searchTermView?.searchTerm || ''
            const cost = Number(r?.metrics?.costMicros || 0) / 1_000_000
            const clicks = Number(r?.metrics?.clicks || 0)
            const conv = Number(r?.metrics?.conversions || 0)
            terms.push({ term, clicks, cost, conv })
            totalSpend += cost
            totalConv += conv
            totalClicks += clicks
        }

        // n-gram waste analysis: cluster by 1-2 word patterns where clicks > 5 and conv = 0
        const ngramStats = new Map<string, { spend: number; clicks: number; conv: number }>()
        for (const t of terms) {
            const words = t.term.toLowerCase().split(/\s+/).filter(w => w.length > 2)
            const grams: string[] = [...words]
            for (let i = 0; i < words.length - 1; i++) {
                grams.push(words[i] + ' ' + words[i + 1])
            }
            for (const g of grams) {
                const cur = ngramStats.get(g) || { spend: 0, clicks: 0, conv: 0 }
                cur.spend += t.cost
                cur.clicks += t.clicks
                cur.conv += t.conv
                ngramStats.set(g, cur)
            }
        }
        const wasteCandidates = [...ngramStats.entries()]
            .filter(([g, s]) => s.clicks >= 5 && s.conv === 0 && s.spend >= 30 && !/[֐-׿]/.test(g.split(' ')[0]) === false || true)
            .filter(([_, s]) => s.clicks >= 5 && s.conv === 0 && s.spend >= 30)
            .sort((a, b) => b[1].spend - a[1].spend)
            .slice(0, 12)
            .map(([pattern, s]) => ({
                pattern,
                spendIls: Math.round(s.spend * 100) / 100,
                clicks: s.clicks,
                conversions: s.conv,
                rationale: `${s.clicks} קליקים · ₪${s.spend.toFixed(0)} הוצאה · 0 המרות → מועמד לרשימת מילים שליליות`,
            }))

        const topConv = terms
            .filter(t => t.conv > 0)
            .sort((a, b) => b.conv - a.conv)
            .slice(0, 10)
            .map(t => ({
                searchTerm: t.term,
                clicks: t.clicks,
                conversions: Math.round(t.conv * 10) / 10,
                cpa: t.conv > 0 ? Math.round((t.cost / t.conv) * 100) / 100 : 0,
            }))

        const wastedSpend = wasteCandidates.reduce((s, w) => s + w.spendIls, 0)
        const wastedPct = totalSpend > 0 ? Math.round((wastedSpend / totalSpend) * 100) : 0

        return {
            available: true,
            daysAnalyzed: days,
            totalTerms: terms.length,
            totalSpendIls: Math.round(totalSpend * 100) / 100,
            wasteByPattern: wasteCandidates,
            topConvertingTerms: topConv,
            estimatedWastedSpendPct: wastedPct,
        }
    } catch (err) {
        return { available: false, reason: `SQR fetch failed: ${(err as Error).message}`, daysAnalyzed: days, totalTerms: 0, totalSpendIls: 0, wasteByPattern: [], topConvertingTerms: [], estimatedWastedSpendPct: 0 }
    }
}

// ─── Auction Insights ─────────────────────────────────────────────────────
export interface AuctionInsightsResult {
    available: boolean
    reason?: string
    competitors: Array<{ domain: string; impressionShare: number; overlapRate: number; outranking: number }>
    impressionShare?: number
    topOfPageRate?: number
    absoluteTopOfPageRate?: number
}

export async function pullAuctionInsights(
    _customerId: string | undefined,
    _tokens: GoogleTokens | null | undefined,
    _days = 90,
    _scope?: CampaignScope,
    _loginCustomerId?: string,
    _developerToken?: string,
): Promise<AuctionInsightsResult> {
    // v22 — Google removed Auction Insights metrics + competitor display_name
    // from the Ads API entirely. The resource `campaign_auction_insight` still
    // exists in the FROM clause but the only useful fields (search_impression_share,
    // search_overlap_rate, search_outranking_share, display_name) all return
    // UNRECOGNIZED_FIELD across v20/v21/v22 as of 2026. There is no programmatic
    // replacement — Auction Insights is now UI-only at ads.google.com.
    //
    // Keeping the function shape for compatibility so downstream consumers don't
    // crash. Surfaces a clear reason so the UI can prompt the user to manually
    // export the Auction Insights report if they need that data.
    return {
        available: false,
        reason: 'Auction Insights API was removed by Google (v20+). Available only via UI export at ads.google.com → Campaigns → Auction Insights.',
        competitors: [],
    }
}

// ─── Account-level metrics (replaces the dropped Auction Insights bits) ──
// Pull whole-account or whole-campaign-scope performance for the same time
// window. This gives us the "how saturated is your account" / "how high is
// your CPC vs benchmark" signals we used to derive from Auction Insights
// account-level metrics. Returns null when unavailable.
export interface AccountMetricsResult {
    available: boolean
    reason?: string
    daysAnalyzed: number
    cost: number
    clicks: number
    impressions: number
    conversions: number
    avgCpcIls?: number
    ctrPct?: number
    conversionRatePct?: number
    cpaIls?: number
}

export async function pullAccountMetrics(
    customerId: string | undefined,
    tokens: GoogleTokens | null | undefined,
    days = 90,
    scope?: CampaignScope,
    loginCustomerId?: string,
    developerToken?: string,
): Promise<AccountMetricsResult> {
    const empty = { available: false, daysAnalyzed: 0, cost: 0, clicks: 0, impressions: 0, conversions: 0 }
    if (!customerId || !tokens?.refreshToken) return { ...empty, reason: 'Account not connected' }
    if (!developerToken) return { ...empty, reason: 'Developer Token חסר' }
    const at = await refreshAccessToken(tokens.refreshToken)
    if (!at) return { ...empty, reason: 'Token refresh failed' }

    try {
        const endDate = new Date()
        const startDate = new Date(endDate.getTime() - days * 24 * 3600 * 1000)
        const dateRange = `BETWEEN '${startDate.toISOString().slice(0, 10)}' AND '${endDate.toISOString().slice(0, 10)}'`

        const queryTarget = scope?.operatingCustomerId || customerId
        const loginHeader = loginCustomerId || customerId

        // Aggregating from campaign-level when scoped — `customer` would be
        // account-wide and leak unrelated business data.
        const query = `
            SELECT
              metrics.cost_micros,
              metrics.clicks,
              metrics.impressions,
              metrics.conversions
            FROM campaign
            WHERE segments.date ${dateRange}${scopeClause(scope)}
        `
        const rows = await gaqlQuery(queryTarget, at, query, developerToken, loginHeader)

        let cost = 0, clicks = 0, impressions = 0, conversions = 0
        for (const r of rows) {
            cost += Number(r?.metrics?.costMicros || 0) / 1_000_000
            clicks += Number(r?.metrics?.clicks || 0)
            impressions += Number(r?.metrics?.impressions || 0)
            conversions += Number(r?.metrics?.conversions || 0)
        }

        return {
            available: true,
            daysAnalyzed: days,
            cost: Math.round(cost * 100) / 100,
            clicks,
            impressions,
            conversions: Math.round(conversions * 10) / 10,
            avgCpcIls: clicks > 0 ? Math.round((cost / clicks) * 100) / 100 : undefined,
            ctrPct: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : undefined,
            conversionRatePct: clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : undefined,
            cpaIls: conversions > 0 ? Math.round((cost / conversions) * 100) / 100 : undefined,
        }
    } catch (err) {
        return { ...empty, reason: `Account metrics fetch failed: ${(err as Error).message}`, daysAnalyzed: days }
    }
}

// ─── Change History ───────────────────────────────────────────────────────
export interface ChangeHistoryResult {
    available: boolean
    reason?: string
    daysAnalyzed: number
    totalChanges: number
    bigChanges: Array<{ changeDateTime: string; changedBy: string; resourceType: string; changeResourceName: string; userType: string; oldValue?: string; newValue?: string }>
}

export async function pullChangeHistory(
    customerId: string | undefined,
    tokens: GoogleTokens | null | undefined,
    days = 180,
    scope?: CampaignScope,
    loginCustomerId?: string,
    developerToken?: string,
): Promise<ChangeHistoryResult> {
    if (!customerId || !tokens?.refreshToken) {
        return { available: false, reason: 'Account not connected', daysAnalyzed: 0, totalChanges: 0, bigChanges: [] }
    }
    if (!developerToken) {
        return { available: false, reason: 'Developer Token חסר', daysAnalyzed: 0, totalChanges: 0, bigChanges: [] }
    }
    const at = await refreshAccessToken(tokens.refreshToken)
    if (!at) return { available: false, reason: 'Token refresh failed', daysAnalyzed: 0, totalChanges: 0, bigChanges: [] }

    try {
        // v22 — change_event has a hard 30-day max window. `user_type` field was
        // removed. Use closed BETWEEN range. Keep `client_type` (still valid).
        // Cap to 28 days — at 30 days exactly, Google often rejects due to
        // calendar-day boundary math (start ms - 30 days can be 31 days ago
        // in UTC if "now" is just past midnight). 28 is safely within bounds.
        const cappedDays = Math.min(days, 28)
        const end = new Date()
        const start = new Date(end.getTime() - cappedDays * 24 * 3600 * 1000)
        const fmt = (d: Date) => `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)}`
        const query = `
            SELECT
              change_event.change_date_time,
              change_event.user_email,
              change_event.client_type,
              change_event.changed_fields,
              change_event.resource_change_operation,
              change_event.change_resource_name,
              change_event.change_resource_type
            FROM change_event
            WHERE change_event.change_date_time BETWEEN '${fmt(start)}' AND '${fmt(end)}'${scopeClause(scope)}
            ORDER BY change_event.change_date_time DESC
            LIMIT 500
        `
        const queryTarget = scope?.operatingCustomerId || customerId
        const loginHeader = loginCustomerId || customerId
        const rows = await gaqlQuery(queryTarget, at, query, developerToken, loginHeader)
        const big = rows
            .filter((r: any) => {
                const rt = r?.changeEvent?.changeResourceType || ''
                return ['CAMPAIGN_BUDGET', 'CAMPAIGN', 'AD_GROUP', 'CONVERSION_ACTION', 'BIDDING_STRATEGY', 'CAMPAIGN_CRITERION'].includes(rt)
            })
            .slice(0, 30)
            .map((r: any) => ({
                changeDateTime: r?.changeEvent?.changeDateTime || '?',
                changedBy: r?.changeEvent?.userEmail || 'unknown',
                resourceType: r?.changeEvent?.changeResourceType || '?',
                changeResourceName: r?.changeEvent?.changeResourceName || '?',
                userType: r?.changeEvent?.clientType || '?',           // v22 — client_type replaced user_type
                oldValue: JSON.stringify(r?.changeEvent?.changedFields || {}).slice(0, 200),
                newValue: '',                                            // old_resource / new_resource not available in v22 query
            }))

        return {
            available: true,
            daysAnalyzed: cappedDays,
            totalChanges: rows.length,
            bigChanges: big,
        }
    } catch (err) {
        return { available: false, reason: `Change history fetch failed: ${(err as Error).message}`, daysAnalyzed: days, totalChanges: 0, bigChanges: [] }
    }
}

// ─── Renderers ────────────────────────────────────────────────────────────

export function renderSearchTermsContext(r: SearchTermsResult): string {
    if (!r.available) {
        return `═══ SEARCH TERMS REPORT ═══\n\n(${r.reason || 'unavailable'})`
    }
    const waste = r.wasteByPattern.slice(0, 8).map(w => `  "${w.pattern}" — ${w.clicks} clicks, ₪${w.spendIls}, ${w.conversions} conv`).join('\n')
    const top = r.topConvertingTerms.slice(0, 5).map(t => `  "${t.searchTerm}" — ${t.conversions} conv @ ₪${t.cpa} CPA`).join('\n')
    return `═══ SEARCH TERMS REPORT (last ${r.daysAnalyzed} days, ${r.totalTerms} terms, ₪${r.totalSpendIls.toLocaleString()} spent) ═══

REAL waste analysis from actual user search queries (not guessed by industry):

Top n-gram waste patterns (high-click, zero-conversion):
${waste || '  (no clear waste patterns)'}

Estimated wasted spend: ${r.estimatedWastedSpendPct}% of total

Top converting search terms:
${top || '  (no conversions logged)'}

USE THIS DATA:
- wasteByPattern → seed for negativeKeywords list (block these patterns immediately)
- topConvertingTerms → ground truth for which themes work; use as new exact-match keywords
- estimatedWastedSpendPct → realistic baseline for wasteAnalysis.estimatedWastedSpendPct in audit output`
}

export function renderAuctionInsightsContext(r: AuctionInsightsResult): string {
    if (!r.available) {
        return `═══ AUCTION INSIGHTS ═══\n\n(${r.reason || 'unavailable'})`
    }
    const comps = r.competitors.slice(0, 8).map(c => `  ${c.domain.padEnd(30)} | IS=${c.impressionShare}% · overlap=${c.overlapRate}% · outranks=${c.outranking}%`).join('\n')
    return `═══ AUCTION INSIGHTS — Real competitor overlap ═══

Account search impression share: ${r.impressionShare ?? '?'}%
Top-of-page rate: ${r.topOfPageRate ?? '?'}%
Absolute top-of-page rate: ${r.absoluteTopOfPageRate ?? '?'}%

Competitors you actually compete with on this account:
${comps || '  (no competitor data — likely too few impressions)'}

USE THIS DATA:
- If impressionShare < 30% → bidding too low or budget-capped
- If overlap with competitor X > 50% → they are the real threat (override client's "competitor list" guess)
- If outranking < 50% → ad rank weak (Quality Score or bid issue)`
}

export function renderChangeHistoryContext(r: ChangeHistoryResult): string {
    if (!r.available) {
        return `═══ CHANGE HISTORY ═══\n\n(${r.reason || 'unavailable'})`
    }
    if (r.totalChanges === 0) {
        return `═══ CHANGE HISTORY ═══\n\nNo changes in last ${r.daysAnalyzed} days — account is dormant.`
    }
    const list = r.bigChanges.slice(0, 12).map(c => `  ${c.changeDateTime} · ${c.changedBy} · ${c.resourceType} · ${c.changeResourceName.split('/').pop()}`).join('\n')
    return `═══ CHANGE HISTORY (last ${r.daysAnalyzed} days, ${r.totalChanges} total events, ${r.bigChanges.length} significant) ═══

Significant structural changes:
${list}

USE THIS DATA:
- If big budget/bid changes coincided with conversion drops → that's the cause, not "Google updated something"
- If multiple users edited same campaign → coordination problem, recommend MCC structure
- If recent changes by AUTOMATIC user_type → Google's auto-apply is touching the account`
}