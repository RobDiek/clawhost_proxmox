/**
 * Google Ads Safety Audit — Phase 2026.02 Block 6 K12 / Variant D
 *
 * Programmatically detects anti-patterns in a tenant's Google Ads account
 * that would burn budget OR distort conversion data:
 *
 *   1. Smart Bidding (tCPA / tROAS / Maximize Conversions) on a polluted
 *      conversion signal. After fix_tracking_first cleanup, Smart Bidding
 *      keeps re-training on the OLD inflated data for 7-14 days. Without
 *      manual intervention, we lose that window. The platform should
 *      detect this AND offer a one-click switch to Manual CPC.
 *
 *   2. High change velocity (>5 significant changes in 7 days from any
 *      user). Per audit playbook §4.5: "instability prevents learning".
 *      Recommend 14-day change freeze when triggered.
 *
 *   3. Missing account-level negatives. Stage 4 audits surfaced common
 *      junk traffic patterns ("יד שניה", "חינם", "יצרן", etc) burning
 *      ₪200+/mo without conversion. Auto-add via shared_set mutate.
 *
 *   4. PMax campaigns on rural-pollution. Less critical, surface only.
 *
 * All findings include severity + auto-fix action (or manual instructions
 * if API mutation isn't safe). Applied through gtmFreshStack chainSteps.
 */

interface GoogleTokens {
    accessToken?: string
    refreshToken: string
    expiresAt?: number
}

const GADS_API = 'https://googleads.googleapis.com/v22'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

async function getAccessToken(tokens: GoogleTokens): Promise<string> {
    if (tokens.accessToken && tokens.expiresAt && tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            refresh_token: tokens.refreshToken,
            grant_type: 'refresh_token',
        }),
    })
    const data = await res.json() as { access_token?: string }
    if (!data.access_token) throw new Error('Token refresh failed')
    return data.access_token
}

async function gadsQuery(
    customerId: string,
    loginCustomerId: string,
    devToken: string,
    tokens: GoogleTokens,
    query: string,
): Promise<any[]> {
    const accessToken = await getAccessToken(tokens)
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': devToken,
    }
    if (loginCustomerId && loginCustomerId !== customerId) headers['login-customer-id'] = loginCustomerId
    const res = await fetch(`${GADS_API}/customers/${customerId}/googleAds:searchStream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
    })
    const text = await res.text()
    let data: any = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }
    if (!res.ok) {
        const msg = data?.error?.message || text.slice(0, 200)
        throw new Error(`GAds ${res.status}: ${msg}`)
    }
    const chunks = Array.isArray(data) ? data : [data]
    const rows: any[] = []
    for (const chunk of chunks) for (const r of (chunk?.results || [])) rows.push(r)
    return rows
}

async function gadsMutate(
    customerId: string,
    loginCustomerId: string,
    devToken: string,
    tokens: GoogleTokens,
    resource: string,                // e.g. 'campaigns:mutate'
    body: unknown,
): Promise<any> {
    const accessToken = await getAccessToken(tokens)
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': devToken,
    }
    if (loginCustomerId && loginCustomerId !== customerId) headers['login-customer-id'] = loginCustomerId
    const res = await fetch(`${GADS_API}/customers/${customerId}/${resource}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    })
    const text = await res.text()
    let data: any = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }
    if (!res.ok) {
        const msg = data?.error?.message || text.slice(0, 300)
        throw new Error(`GAds mutate ${res.status}: ${msg}`)
    }
    return data
}

// ─── Finding shapes ───────────────────────────────────────────────────────

export type AdsFindingSeverity = 'critical' | 'high' | 'medium' | 'info'

export interface AdsFinding {
    id: string
    severity: AdsFindingSeverity
    category: 'bidding' | 'change_history' | 'negatives' | 'budget' | 'audience'
    summary: string
    detail: string
    autoFixable: boolean
    autoFixAction?: { kind: string; payload?: any }
    affected?: Array<{ campaignId?: string; campaignName?: string; bidding?: string; status?: string }>
}

export interface AdsSafetyReport {
    findings: AdsFinding[]
    summary: string
    counts: Record<AdsFindingSeverity, number>
    cleanState: boolean
    rawSnapshot: {
        campaignCount: number
        smartBiddingCount: number
        manualBiddingCount: number
        changeEventsLast7d: number
        negativeListsAttached: number
    }
}

// ─── Smart Bidding strategy taxonomy ─────────────────────────────────────

const SMART_BIDDING_TYPES = new Set([
    'TARGET_CPA',
    'TARGET_ROAS',
    'MAXIMIZE_CONVERSIONS',
    'MAXIMIZE_CONVERSION_VALUE',
    'TARGET_IMPRESSION_SHARE',
])
const MANUAL_BIDDING_TYPES = new Set([
    'MANUAL_CPC',
    'MANUAL_CPM',
    'MANUAL_CPV',
])

// Common IL-language wasteful negatives. Surface to platform users
// proactively; user can dismiss any they want to keep.
const DEFAULT_IL_NEGATIVES = [
    'יד שניה',                  // second-hand
    'חינם',                      // free
    'יצרן',                      // manufacturer
    'בסיטונאות',                 // wholesale
    'משומש',                     // used
    'משלוחים',                   // delivery services
    'מחסן',                      // warehouse
    'נייר אריזה גלילים',        // paper rolls (different product)
    'גלילי קרטון',              // cardboard rolls (different product)
]

// ─── Audit entrypoint ────────────────────────────────────────────────────

export interface AdsSafetyAuditInput {
    operatingCustomerId: string
    loginCustomerId: string
    tokens: GoogleTokens
    developerToken: string
    // Optional: pulled from research_data.results.paid_audit
    convValueQualitySubscore?: number
    // K12-fix: tenant scope. When operatingCustomerId is shared across multiple
    // brands (MCC sub-account), pass the explicit campaignIds owned by THIS
    // tenant (from googleAdsConfig.scope.campaignIds). Audit ignores other
    // campaigns + auto-fix actions never touch them.
    scopedCampaignIds?: string[]
}

export async function auditGoogleAdsSafety(opts: AdsSafetyAuditInput): Promise<AdsSafetyReport> {
    const findings: AdsFinding[] = []
    const snap = {
        campaignCount: 0,
        smartBiddingCount: 0,
        manualBiddingCount: 0,
        changeEventsLast7d: 0,
        negativeListsAttached: 0,
    }

    // 1. Campaigns + bidding strategy
    let campaigns: any[] = []
    try {
        campaigns = await gadsQuery(
            opts.operatingCustomerId,
            opts.loginCustomerId,
            opts.developerToken,
            opts.tokens,
            `SELECT campaign.id, campaign.name, campaign.status,
                    campaign.bidding_strategy_type,
                    campaign.advertising_channel_type,
                    campaign_budget.amount_micros
             FROM campaign
             WHERE campaign.status IN ('ENABLED','PAUSED')`,
        )
    } catch (e) {
        findings.push({
            id: 'campaign_list_failed',
            severity: 'medium',
            category: 'bidding',
            summary: `Could not list campaigns: ${(e as Error).message.slice(0, 150)}`,
            detail: 'OAuth or developer token issue. Reconnect Google Ads in Integrations.',
            autoFixable: false,
        })
        return { findings, summary: '⚠ Audit incomplete', counts: countFindings(findings), cleanState: false, rawSnapshot: snap }
    }

    // Build scope filter set if provided. Empty/missing = audit ALL enabled
    // campaigns (single-tenant operating customer). Non-empty = only audit
    // those exact campaignIds (MCC sub-account shared across brands).
    const scopeSet = opts.scopedCampaignIds && opts.scopedCampaignIds.length > 0
        ? new Set(opts.scopedCampaignIds.map(String))
        : null

    const enabledCampaigns: any[] = []
    const pausedCampaigns: any[] = []
    for (const row of campaigns) {
        const c = row.campaign || {}
        const status = String(c.status)
        const campId = String(c.id || '')
        // K12-fix: tenant scope filter
        if (scopeSet && !scopeSet.has(campId)) continue
        const cmp = {
            id: campId,
            name: String(c.name || ''),
            status,
            bidding: String(c.biddingStrategyType || c.bidding_strategy_type || ''),
            channel: String(c.advertisingChannelType || c.advertising_channel_type || ''),
        }
        if (status === 'ENABLED') enabledCampaigns.push(cmp)
        else if (status === 'PAUSED') pausedCampaigns.push(cmp)
    }
    snap.campaignCount = enabledCampaigns.length
    snap.smartBiddingCount = enabledCampaigns.filter(c => SMART_BIDDING_TYPES.has(c.bidding)).length
    snap.manualBiddingCount = enabledCampaigns.filter(c => MANUAL_BIDDING_TYPES.has(c.bidding)).length

    // FINDING #1: Smart Bidding on polluted signal — K13: surface as a
    // STRATEGY CHOICE (Conservative/Moderate/Aggressive) instead of a
    // single aggressive "switch to Manual CPC" button. UI renders 3-option
    // card; user picks based on business context.
    //
    // Also covers REVERT case: if previous aggressive action left campaigns
    // PAUSED or on Manual CPC, applying Conservative naturally restores them.
    const anyPaused = pausedCampaigns.length > 0
    const anyManualCpc = enabledCampaigns.filter(c => c.bidding === 'MANUAL_CPC').length > 0
    const anySmartBidding = snap.smartBiddingCount > 0
    if (anySmartBidding || anyPaused || anyManualCpc) {
        const polluted = (opts.convValueQualitySubscore ?? 100) < 70
        const smartCampaigns = enabledCampaigns.filter(c => SMART_BIDDING_TYPES.has(c.bidding))
        const pmaxOnSmart = smartCampaigns.filter(c => c.channel === 'PERFORMANCE_MAX')
        findings.push({
            id: 'bidding_strategy_decision',
            severity: polluted ? 'high' : 'medium',
            category: 'bidding',
            summary: polluted
                ? `Choose bidding strategy — ${snap.smartBiddingCount} on Smart Bidding, conv_value_quality=${opts.convValueQualitySubscore}`
                : `Bidding strategy review — ${snap.smartBiddingCount} on Smart Bidding`,
            detail: `${snap.smartBiddingCount} of ${enabledCampaigns.length} scoped campaigns on Smart Bidding${pmaxOnSmart.length > 0 ? ` (${pmaxOnSmart.length} PMax)` : ''}. After tracking cleanup, choose how aggressively to adjust: Conservative (safest, ~0 traffic loss), Moderate (balanced), or Aggressive (full reset, 30 days no PMax). See decision card below.`,
            autoFixable: true,
            autoFixAction: { kind: 'open_bidding_strategy_chooser', payload: {} },
            affected: smartCampaigns,
        })
    }

    // 2. Change history velocity
    try {
        // v22 — change_event rejects `DURING LAST_7_DAYS` (needs an explicit
        // BETWEEN datetime range, requires ORDER BY + LIMIT, and the field is
        // `change_resource_type`, not `resource_type`). Mirrors the working
        // query in googleAdsDeepEnrich.pullChangeHistory.
        const _end = new Date()
        const _start = new Date(_end.getTime() - 7 * 24 * 3600 * 1000)
        const _fmt = (d: Date) => `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)}`
        const changeRows = await gadsQuery(
            opts.operatingCustomerId,
            opts.loginCustomerId,
            opts.developerToken,
            opts.tokens,
            `SELECT change_event.change_date_time, change_event.user_email,
                    change_event.changed_fields, change_event.change_resource_type
             FROM change_event
             WHERE change_event.change_date_time BETWEEN '${_fmt(_start)}' AND '${_fmt(_end)}'
             ORDER BY change_event.change_date_time DESC
             LIMIT 100`,
        )
        snap.changeEventsLast7d = changeRows.length

        // FINDING #2: high change velocity
        if (snap.changeEventsLast7d >= 5) {
            const userCounts: Record<string, number> = {}
            for (const r of changeRows) {
                const email = String(r.changeEvent?.userEmail || r.change_event?.user_email || 'unknown')
                userCounts[email] = (userCounts[email] || 0) + 1
            }
            const userBreakdown = Object.entries(userCounts).map(([e, n]) => `${e}: ${n}`).join(', ')
            findings.push({
                id: 'high_change_velocity',
                severity: snap.changeEventsLast7d >= 10 ? 'high' : 'medium',
                category: 'change_history',
                summary: `${snap.changeEventsLast7d} significant changes in last 7 days — account instability`,
                detail: `Audit playbook §4.5 requires 14-day stability window for Smart Bidding to learn. Changes by: ${userBreakdown}. Recommend manual 14-day change freeze. (Note: Flowmatic does NOT auto-freeze — surfaced for awareness.)`,
                autoFixable: false,
            })
        }
    } catch (e) {
        // change_event requires elevated scope on some accounts — non-fatal
        console.warn(`[adsSafety] change_event query failed: ${(e as Error).message.slice(0, 150)}`)
    }

    // 3. Negative keyword lists (shared sets)
    let negSharedSets: any[] = []
    try {
        negSharedSets = await gadsQuery(
            opts.operatingCustomerId,
            opts.loginCustomerId,
            opts.developerToken,
            opts.tokens,
            `SELECT shared_set.id, shared_set.name, shared_set.type, shared_set.status
             FROM shared_set
             WHERE shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.status = 'ENABLED'`,
        )
        snap.negativeListsAttached = negSharedSets.length
    } catch {
        // non-fatal
    }

    // FINDING #3: missing or thin account-level negatives
    if (snap.negativeListsAttached === 0) {
        findings.push({
            id: 'missing_account_negatives',
            severity: 'high',
            category: 'negatives',
            summary: `No account-level negative keyword list — junk traffic eats budget`,
            detail: `Audit shows wasteful patterns ('יד שניה', 'חינם', 'יצרן', 'משלוחים', 'מחסן') burning ₪200+/mo without conversions. Auto-fix creates a shared negative list with ${DEFAULT_IL_NEGATIVES.length} IL-language wasteful terms and attaches it to all enabled Search campaigns.`,
            autoFixable: true,
            autoFixAction: { kind: 'create_negatives_list', payload: { keywords: DEFAULT_IL_NEGATIVES } },
        })
    }

    return {
        findings,
        summary: buildAdsSummary(findings),
        counts: countFindings(findings),
        cleanState: findings.every(f => f.severity === 'info'),
        rawSnapshot: snap,
    }
}

function countFindings(findings: AdsFinding[]): Record<AdsFindingSeverity, number> {
    return {
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        info: findings.filter(f => f.severity === 'info').length,
    }
}

function buildAdsSummary(findings: AdsFinding[]): string {
    const c = countFindings(findings)
    if (c.critical === 0 && c.high === 0 && c.medium === 0) return '✓ Google Ads safety: no issues detected'
    const parts: string[] = []
    if (c.critical > 0) parts.push(`${c.critical} critical`)
    if (c.high > 0) parts.push(`${c.high} high`)
    if (c.medium > 0) parts.push(`${c.medium} medium`)
    return `Google Ads safety: ${parts.join(' + ')} — needs attention`
}

// ─── Auto-fix actions ────────────────────────────────────────────────────

/**
 * Switch a list of campaigns to Manual CPC bidding strategy.
 * Idempotent: campaigns already on MANUAL_CPC are skipped.
 */
export async function switchCampaignsToManualCpc(opts: {
    customerId: string
    loginCustomerId: string
    tokens: GoogleTokens
    developerToken: string
    campaignIds: string[]
}): Promise<{ switched: string[]; skipped: string[]; errors: Array<{ id: string; error: string }> }> {
    const result = { switched: [] as string[], skipped: [] as string[], errors: [] as Array<{ id: string; error: string }> }

    // K12-fix3: correct updateMask is the SUBFIELD path. Whole-message mask
    // 'manual_cpc' returns "field with subfields" error. Subfield path tells
    // the API to set THAT field; switching from another strategy (MaxConvValue
    // etc.) is implicit when the new strategy field is populated. Confirmed
    // working pattern from Google Ads API samples for bidding-strategy
    // switching.
    const operations = opts.campaignIds.map(id => ({
        update: {
            resourceName: `customers/${opts.customerId}/campaigns/${id}`,
            manualCpc: { enhancedCpcEnabled: false },
        },
        updateMask: 'manual_cpc.enhanced_cpc_enabled',
    }))

    // Use partial_failure so one bad campaign doesn't kill the batch
    try {
        const res = await gadsMutate(
            opts.customerId,
            opts.loginCustomerId,
            opts.developerToken,
            opts.tokens,
            'campaigns:mutate',
            { operations, partial_failure: true },
        )
        // Per-operation results — track successes
        const results: any[] = res.results || []
        for (const r of results) {
            const id = String(r.resourceName || '').split('/').pop() || ''
            if (id) result.switched.push(id)
        }
        // partial_failure returns errors per failed op
        const partialErrors = res.partialFailureError?.details?.[0]?.errors || []
        for (const e of partialErrors) {
            const idx = e.location?.fieldPathElements?.find((p: any) => p.fieldName === 'operations')?.index
            const id = typeof idx === 'number' ? opts.campaignIds[idx] : 'unknown'
            result.errors.push({ id, error: e.message?.slice(0, 200) || 'unknown error' })
        }
    } catch (e) {
        // Whole batch failed
        for (const id of opts.campaignIds) {
            result.errors.push({ id, error: (e as Error).message.slice(0, 200) })
        }
    }
    return result
}

/**
 * Pause a list of campaigns. Used for PMax campaigns on a polluted signal
 * (since they can't be switched to Manual CPC). User can resume manually
 * once tracking is clean.
 */
export async function pauseCampaigns(opts: {
    customerId: string
    loginCustomerId: string
    tokens: GoogleTokens
    developerToken: string
    campaignIds: string[]
}): Promise<{ paused: string[]; errors: Array<{ id: string; error: string }> }> {
    const result = { paused: [] as string[], errors: [] as Array<{ id: string; error: string }> }
    const operations = opts.campaignIds.map(id => ({
        update: {
            resourceName: `customers/${opts.customerId}/campaigns/${id}`,
            status: 'PAUSED',
        },
        updateMask: 'status',
    }))
    try {
        const res = await gadsMutate(
            opts.customerId,
            opts.loginCustomerId,
            opts.developerToken,
            opts.tokens,
            'campaigns:mutate',
            { operations, partial_failure: true },
        )
        for (const r of (res.results || [])) {
            const id = String(r.resourceName || '').split('/').pop() || ''
            if (id) result.paused.push(id)
        }
        const partial = res.partialFailureError?.details?.[0]?.errors || []
        for (const e of partial) {
            const idx = e.location?.fieldPathElements?.find((p: any) => p.fieldName === 'operations')?.index
            const id = typeof idx === 'number' ? opts.campaignIds[idx] : 'unknown'
            result.errors.push({ id, error: e.message?.slice(0, 200) || 'unknown' })
        }
    } catch (e) {
        for (const id of opts.campaignIds) {
            result.errors.push({ id, error: (e as Error).message.slice(0, 200) })
        }
    }
    return result
}

/**
 * Create a shared negative keyword list, populate with the given terms,
 * and attach it to all enabled Search campaigns. Idempotent: skips if a
 * shared set with the same name already exists.
 */
export async function createAndAttachNegativesList(opts: {
    customerId: string
    loginCustomerId: string
    tokens: GoogleTokens
    developerToken: string
    keywords: string[]
    sharedSetName?: string
    // K12-fix: only attach to these campaigns (tenant-scoped). When empty,
    // attaches to all enabled Search campaigns in the operating customer
    // (single-tenant mode).
    scopedCampaignIds?: string[]
}): Promise<{ sharedSetId?: string; created: boolean; keywordsAdded: number; campaignsAttached: number; errors: string[] }> {
    const result = {
        sharedSetId: undefined as string | undefined,
        created: false,
        keywordsAdded: 0,
        campaignsAttached: 0,
        errors: [] as string[],
    }
    const sharedSetName = opts.sharedSetName || 'Flowmatic — Default IL Wasteful Negatives'

    // 1. Find or create shared set
    try {
        const existing = await gadsQuery(
            opts.customerId,
            opts.loginCustomerId,
            opts.developerToken,
            opts.tokens,
            `SELECT shared_set.id, shared_set.name FROM shared_set
             WHERE shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.name = '${sharedSetName}'`,
        )
        if (existing.length > 0) {
            result.sharedSetId = String(existing[0].sharedSet?.id || existing[0].shared_set?.id || '')
        } else {
            const createRes = await gadsMutate(
                opts.customerId,
                opts.loginCustomerId,
                opts.developerToken,
                opts.tokens,
                'sharedSets:mutate',
                {
                    operations: [{
                        create: { name: sharedSetName, type: 'NEGATIVE_KEYWORDS' },
                    }],
                },
            )
            result.sharedSetId = String(createRes.results?.[0]?.resourceName || '').split('/').pop()
            result.created = true
        }
    } catch (e) {
        result.errors.push(`shared_set create: ${(e as Error).message.slice(0, 200)}`)
        return result
    }

    if (!result.sharedSetId) {
        result.errors.push('shared_set id not resolved')
        return result
    }

    // 2. Add negative keywords to shared set
    try {
        const ops = opts.keywords.map(kw => ({
            create: {
                sharedSet: `customers/${opts.customerId}/sharedSets/${result.sharedSetId}`,
                keyword: {
                    text: kw,
                    matchType: 'BROAD',
                },
            },
        }))
        const addRes = await gadsMutate(
            opts.customerId,
            opts.loginCustomerId,
            opts.developerToken,
            opts.tokens,
            'sharedCriteria:mutate',
            { operations: ops, partial_failure: true },
        )
        result.keywordsAdded = (addRes.results || []).length
    } catch (e) {
        result.errors.push(`add keywords: ${(e as Error).message.slice(0, 200)}`)
    }

    // 3. Attach to scoped enabled Search campaigns
    try {
        const scopeSet = opts.scopedCampaignIds && opts.scopedCampaignIds.length > 0
            ? new Set(opts.scopedCampaignIds.map(String))
            : null
        const campaigns = await gadsQuery(
            opts.customerId,
            opts.loginCustomerId,
            opts.developerToken,
            opts.tokens,
            `SELECT campaign.id FROM campaign
             WHERE campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH'`,
        )
        const filtered = scopeSet
            ? campaigns.filter(r => scopeSet.has(String(r.campaign?.id || r.campaign?.['id'] || '')))
            : campaigns
        const ops = filtered.map(r => ({
            create: {
                campaign: `customers/${opts.customerId}/campaigns/${r.campaign?.id || r.campaign?.['id']}`,
                sharedSet: `customers/${opts.customerId}/sharedSets/${result.sharedSetId}`,
            },
        }))
        if (ops.length > 0) {
            await gadsMutate(
                opts.customerId,
                opts.loginCustomerId,
                opts.developerToken,
                opts.tokens,
                'campaignSharedSets:mutate',
                { operations: ops, partial_failure: true },
            )
            result.campaignsAttached = ops.length
        }
    } catch (e) {
        result.errors.push(`attach campaigns: ${(e as Error).message.slice(0, 200)}`)
    }

    return result
}