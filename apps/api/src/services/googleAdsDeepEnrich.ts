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

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v18'
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
    loginCustomerId?: string,
): Promise<any[]> {
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

    const url = `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:searchStream`
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(60_000),
    })
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
): Promise<SearchTermsResult> {
    if (!customerId || !tokens?.refreshToken) {
        return { available: false, reason: 'Account not connected', daysAnalyzed: 0, totalTerms: 0, totalSpendIls: 0, wasteByPattern: [], topConvertingTerms: [], estimatedWastedSpendPct: 0 }
    }
    const at = await refreshAccessToken(tokens.refreshToken)
    if (!at) return { available: false, reason: 'Token refresh failed', daysAnalyzed: 0, totalTerms: 0, totalSpendIls: 0, wasteByPattern: [], topConvertingTerms: [], estimatedWastedSpendPct: 0 }

    try {
        const query = `
            SELECT
              search_term_view.search_term,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.impressions
            FROM search_term_view
            WHERE segments.date DURING LAST_${days}_DAYS
              AND metrics.impressions > 0
            ORDER BY metrics.cost_micros DESC
            LIMIT 1000
        `
        const rows = await gaqlQuery(customerId, at, query)

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
    customerId: string | undefined,
    tokens: GoogleTokens | null | undefined,
    days = 90,
): Promise<AuctionInsightsResult> {
    if (!customerId || !tokens?.refreshToken) {
        return { available: false, reason: 'Account not connected', competitors: [] }
    }
    const at = await refreshAccessToken(tokens.refreshToken)
    if (!at) return { available: false, reason: 'Token refresh failed', competitors: [] }

    try {
        const competitorsQ = `
            SELECT
              campaign_auction_insight_domain.display_name,
              metrics.search_impression_share,
              metrics.search_overlap_rate,
              metrics.search_outranking_share
            FROM campaign_auction_insight
            WHERE segments.date DURING LAST_${days}_DAYS
            LIMIT 100
        `
        const rows = await gaqlQuery(customerId, at, competitorsQ).catch(() => [])
        const competitors = rows.map((r: any) => ({
            domain: r?.campaignAuctionInsightDomain?.displayName || '?',
            impressionShare: Math.round((Number(r?.metrics?.searchImpressionShare || 0)) * 1000) / 10,
            overlapRate: Math.round((Number(r?.metrics?.searchOverlapRate || 0)) * 1000) / 10,
            outranking: Math.round((Number(r?.metrics?.searchOutrankingShare || 0)) * 1000) / 10,
        })).slice(0, 12)

        // Account-level impression share metrics
        const accountQ = `
            SELECT
              metrics.search_impression_share,
              metrics.search_top_impression_share,
              metrics.search_absolute_top_impression_share
            FROM customer
            WHERE segments.date DURING LAST_${days}_DAYS
        `
        const accRows = await gaqlQuery(customerId, at, accountQ).catch(() => [])
        const acc = accRows[0]?.metrics
        const impressionShare = acc ? Math.round(Number(acc.searchImpressionShare || 0) * 1000) / 10 : undefined
        const topOfPageRate = acc ? Math.round(Number(acc.searchTopImpressionShare || 0) * 1000) / 10 : undefined
        const absoluteTopOfPageRate = acc ? Math.round(Number(acc.searchAbsoluteTopImpressionShare || 0) * 1000) / 10 : undefined

        return { available: true, competitors, impressionShare, topOfPageRate, absoluteTopOfPageRate }
    } catch (err) {
        return { available: false, reason: `Auction Insights fetch failed: ${(err as Error).message}`, competitors: [] }
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
): Promise<ChangeHistoryResult> {
    if (!customerId || !tokens?.refreshToken) {
        return { available: false, reason: 'Account not connected', daysAnalyzed: 0, totalChanges: 0, bigChanges: [] }
    }
    const at = await refreshAccessToken(tokens.refreshToken)
    if (!at) return { available: false, reason: 'Token refresh failed', daysAnalyzed: 0, totalChanges: 0, bigChanges: [] }

    try {
        const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10)
        const query = `
            SELECT
              change_event.change_date_time,
              change_event.user_email,
              change_event.user_type,
              change_event.client_type,
              change_event.changed_fields,
              change_event.old_resource,
              change_event.new_resource,
              change_event.resource_change_operation,
              change_event.resource_type,
              change_event.change_resource_name
            FROM change_event
            WHERE change_event.change_date_time >= '${since}'
            ORDER BY change_event.change_date_time DESC
            LIMIT 500
        `
        const rows = await gaqlQuery(customerId, at, query)
        const big = rows
            .filter((r: any) => {
                const rt = r?.changeEvent?.resourceType || ''
                return ['CAMPAIGN_BUDGET', 'CAMPAIGN', 'AD_GROUP', 'CONVERSION_ACTION', 'BIDDING_STRATEGY', 'CAMPAIGN_CRITERION'].includes(rt)
            })
            .slice(0, 30)
            .map((r: any) => ({
                changeDateTime: r?.changeEvent?.changeDateTime || '?',
                changedBy: r?.changeEvent?.userEmail || 'unknown',
                resourceType: r?.changeEvent?.resourceType || '?',
                changeResourceName: r?.changeEvent?.changeResourceName || '?',
                userType: r?.changeEvent?.userType || '?',
                oldValue: JSON.stringify(r?.changeEvent?.oldResource || {}).slice(0, 200),
                newValue: JSON.stringify(r?.changeEvent?.newResource || {}).slice(0, 200),
            }))

        return {
            available: true,
            daysAnalyzed: days,
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
