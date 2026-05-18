/**
 * Phase 4.2.3-A — Tenant Setup State Classifier
 *
 * Foundation service for state-aware methodology. Every downstream stage
 * (6 audit / 7 GTM / 8 conversions / 9 media plan) reads this classification
 * and adapts its behavior so that:
 *   - greenfield tenants get fresh setup paths (create everything from scratch)
 *   - mature tenants get integration + optimization paths (reuse existing,
 *     don't duplicate tracking, anchor strategy on real historical data)
 *   - partial tenants get a hybrid (fill gaps without overriding what works)
 *
 * Classification thresholds (confirmed with Sergei 2026-05-18):
 *   mature_setup  : Google Ads connected + ≥1 active campaign + ≥30 conv in 90d + ≥1 enabled conversion_action
 *   partial_setup : Google Ads connected + ≥1 active campaign, but below mature thresholds
 *   greenfield    : no Google Ads connection OR 0 active campaigns
 *
 * The service is READ-ONLY. No DB writes, no API mutations. Safe to call
 * repeatedly. Caller-side can cache the result for a single request.
 *
 * Reference: see `feedback_research_data_dual_write` and
 * `feedback_gtm_404_ambiguous` for the bug class this state-awareness
 * prevents from recurring.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'

const GTM_API = 'https://www.googleapis.com/tagmanager/v2'
const GADS_API = 'https://googleads.googleapis.com/v22'
const FETCH_TIMEOUT_MS = 12_000

const MATURE_CONV_THRESHOLD_90D = 30
const MATURE_ACTIVE_CAMPAIGNS_THRESHOLD = 1

export type Classification = 'greenfield' | 'partial_setup' | 'mature_setup'

export type Stage6Mode = 'readiness' | 'performance_review'
export type Stage7Mode = 'create_and_install' | 'augment_existing' | 'install_snippet_only'
export type Stage8Mode = 'create_all' | 'map_existing_create_missing' | 'map_only'
export type Stage9Mode = 'build_new' | 'hybrid' | 'optimize_existing'

export interface ExistingConversionAction {
    resourceName: string
    id: string
    name: string
    category: string                  // SUBMIT_LEAD_FORM, PHONE_CALL_LEAD, PURCHASE, QUALIFIED_LEAD, etc.
    type: string                      // WEBPAGE, UPLOAD_CLICKS, etc.
    primaryForGoal: boolean
    last90dConv: number               // 0 if not aggregable
    googleAdsConversionId?: string    // extracted from tag_snippets eventSnippet (AW-XXX/YYY)
    googleAdsConversionLabel?: string
    isMazhirOwned: boolean            // name starts with 'Mazhir — '
}

export interface GoogleAdsSetupSignals {
    connected: boolean
    rootCustomerId?: string
    operatingCustomerId?: string
    loginCustomerId?: string
    activeCampaignsCount: number
    last90dConversions: number
    last90dSpendIls: number
    existingConversionActions: ExistingConversionAction[]
    discoveryError?: string
}

export interface GtmSetupSignals {
    connected: boolean
    targetPicked: boolean
    accountId?: string
    containerId?: string
    publicId?: string
    containerName?: string
    hasLiveVersion: boolean
    liveVersionTagCount: number
    snippetInstalledOnSite: boolean
    snippetInstallDetail?: string
    existingMazhirAutoWorkspaceCount: number
    discoveryError?: string
}

export interface Ga4SetupSignals {
    connected: boolean
    measurementId?: string            // from picker selection if present
}

export interface RecommendedMode {
    stage6_audit: Stage6Mode
    stage7_gtm: Stage7Mode
    stage8_conv: Stage8Mode
    stage9_plan: Stage9Mode
}

export interface TenantSetupState {
    instanceId: string
    classification: Classification
    classificationReason: string
    signals: {
        googleAds: GoogleAdsSetupSignals
        gtm: GtmSetupSignals
        ga4: Ga4SetupSignals
        websiteCallTracking: 'none' | 'callrail' | 'whatconverts' | 'other' | 'unknown'
    }
    recommendedMode: RecommendedMode
    generatedAt: string
}

// ═════════════════════════════════════════════════════════════════════════
// Main entry point
// ═════════════════════════════════════════════════════════════════════════

export async function classifyTenantSetupState(instanceId: string): Promise<TenantSetupState> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')

    const rd: any = inst.researchData || {}

    // Discover in parallel (each can take seconds, especially Google Ads + GTM API calls)
    const [adsSignals, gtmSignals, ga4Signals] = await Promise.all([
        discoverGoogleAdsState(inst).catch(err => ({
            connected: false,
            activeCampaignsCount: 0,
            last90dConversions: 0,
            last90dSpendIls: 0,
            existingConversionActions: [],
            discoveryError: (err as Error).message,
        }) satisfies GoogleAdsSetupSignals),
        discoverGtmState(inst).catch(err => ({
            connected: false,
            targetPicked: false,
            hasLiveVersion: false,
            liveVersionTagCount: 0,
            snippetInstalledOnSite: false,
            existingMazhirAutoWorkspaceCount: 0,
            discoveryError: (err as Error).message,
        }) satisfies GtmSetupSignals),
        discoverGa4State(inst).catch(err => ({
            connected: false,
            discoveryError: (err as Error).message,
        }) as Ga4SetupSignals),
    ])

    const profile: any = rd.paidProfile || {}
    const callTracking: TenantSetupState['signals']['websiteCallTracking'] =
        profile.trackingStack?.callTracking || 'unknown'

    const { classification, reason } = classify(adsSignals)
    const recommendedMode = pickRecommendedMode(classification, adsSignals, gtmSignals)

    return {
        instanceId,
        classification,
        classificationReason: reason,
        signals: {
            googleAds: adsSignals,
            gtm: gtmSignals,
            ga4: ga4Signals,
            websiteCallTracking: callTracking,
        },
        recommendedMode,
        generatedAt: new Date().toISOString(),
    }
}

// ═════════════════════════════════════════════════════════════════════════
// Classification logic
// ═════════════════════════════════════════════════════════════════════════

function classify(ads: GoogleAdsSetupSignals): { classification: Classification; reason: string } {
    if (!ads.connected) {
        return { classification: 'greenfield', reason: 'Google Ads not connected' }
    }
    if (ads.discoveryError) {
        // Conservative: when we can't see the truth, default to greenfield rather
        // than incorrectly assuming maturity. Audit / plan paths will then fill
        // the picture defensively.
        return {
            classification: 'greenfield',
            reason: `Google Ads connected but discovery failed (${ads.discoveryError}) — defaulting to greenfield conservatively`,
        }
    }
    if (ads.activeCampaignsCount < MATURE_ACTIVE_CAMPAIGNS_THRESHOLD) {
        return {
            classification: 'greenfield',
            reason: `Connected but 0 active campaigns (active threshold ${MATURE_ACTIVE_CAMPAIGNS_THRESHOLD})`,
        }
    }
    if (ads.last90dConversions < MATURE_CONV_THRESHOLD_90D) {
        return {
            classification: 'partial_setup',
            reason: `${ads.activeCampaignsCount} active campaign(s), only ${ads.last90dConversions} conv in 90d (mature threshold ${MATURE_CONV_THRESHOLD_90D})`,
        }
    }
    if (ads.existingConversionActions.length === 0) {
        return {
            classification: 'partial_setup',
            reason: `${ads.last90dConversions} conv in 90d but no enabled conversion_action rows visible`,
        }
    }
    return {
        classification: 'mature_setup',
        reason: `${ads.activeCampaignsCount} active campaign(s) · ${ads.last90dConversions} conv in 90d · ${ads.existingConversionActions.length} conversion action(s)`,
    }
}

function pickRecommendedMode(
    c: Classification,
    _ads: GoogleAdsSetupSignals,
    gtm: GtmSetupSignals,
): RecommendedMode {
    // GTM substate (independent of Ads classification):
    //   - if snippet installed on site → augment existing (don't reinstall)
    //   - if not → create_and_install (or install_snippet_only when container picked
    //     but snippet missing — Phase 4.2.3-C will distinguish)
    const stage7: Stage7Mode = gtm.snippetInstalledOnSite
        ? 'augment_existing'
        : gtm.targetPicked
            ? 'install_snippet_only'
            : 'create_and_install'

    switch (c) {
        case 'greenfield':
            return {
                stage6_audit: 'readiness',
                stage7_gtm: stage7,
                stage8_conv: 'create_all',
                stage9_plan: 'build_new',
            }
        case 'partial_setup':
            return {
                stage6_audit: 'readiness',
                stage7_gtm: stage7,
                stage8_conv: _ads.existingConversionActions.length > 0 ? 'map_existing_create_missing' : 'create_all',
                stage9_plan: 'hybrid',
            }
        case 'mature_setup':
            return {
                stage6_audit: 'performance_review',
                stage7_gtm: stage7,
                stage8_conv: 'map_existing_create_missing',
                stage9_plan: 'optimize_existing',
            }
    }
}

// ═════════════════════════════════════════════════════════════════════════
// Google Ads discovery
// ═════════════════════════════════════════════════════════════════════════

async function discoverGoogleAdsState(inst: any): Promise<GoogleAdsSetupSignals> {
    const cfg: any = inst.googleAdsConfig || {}
    const tokens: any = inst.googleTokens || {}
    if (!cfg.customerId || !tokens.refreshToken) {
        return {
            connected: false,
            activeCampaignsCount: 0,
            last90dConversions: 0,
            last90dSpendIls: 0,
            existingConversionActions: [],
        }
    }
    const developerToken: string = cfg.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
    if (!developerToken) {
        return {
            connected: false,
            activeCampaignsCount: 0,
            last90dConversions: 0,
            last90dSpendIls: 0,
            existingConversionActions: [],
            discoveryError: 'developer token missing',
        }
    }
    const rootCustomerId: string = String(cfg.customerId)
    const operatingCustomerId: string | undefined = cfg.scope?.operatingCustomerId
        ? String(cfg.scope.operatingCustomerId)
        : undefined
    const customerId: string = operatingCustomerId || rootCustomerId
    const loginCustomerId: string | undefined = operatingCustomerId
        ? rootCustomerId
        : (cfg.loginCustomerId || undefined)

    const accessToken = await refreshAccessToken(tokens.refreshToken)
    if (!accessToken) {
        return {
            connected: false,
            rootCustomerId,
            operatingCustomerId,
            loginCustomerId,
            activeCampaignsCount: 0,
            last90dConversions: 0,
            last90dSpendIls: 0,
            existingConversionActions: [],
            discoveryError: 'failed to refresh OAuth access token',
        }
    }

    // Date range: today minus 90 days, today minus 1 (Ads metrics are not realtime)
    const today = new Date()
    const end = new Date(today.getTime() - 24 * 3600 * 1000)
    const start = new Date(today.getTime() - 91 * 24 * 3600 * 1000)
    const endStr = end.toISOString().slice(0, 10)
    const startStr = start.toISOString().slice(0, 10)

    // ── Query 1: active campaigns (count + 90d aggregates) ──
    const campaignsQuery = `
        SELECT campaign.id, campaign.status, metrics.conversions, metrics.cost_micros
        FROM campaign
        WHERE campaign.status = 'ENABLED'
              AND segments.date BETWEEN '${startStr}' AND '${endStr}'
    `
    const campaignRows = await gaqlStream(customerId, accessToken, developerToken, campaignsQuery, loginCustomerId)
        .catch(err => { throw new Error(`campaigns query failed: ${(err as Error).message}`) })

    const seenCampaigns = new Set<string>()
    let totalConv = 0
    let totalSpendMicros = 0
    for (const row of campaignRows) {
        const cid = row.campaign?.id || row.campaign?.id?.toString?.()
        if (cid) seenCampaigns.add(String(cid))
        totalConv += Number(row.metrics?.conversions || 0)
        totalSpendMicros += Number(row.metrics?.costMicros || row.metrics?.cost_micros || 0)
    }
    const activeCampaignsCount = seenCampaigns.size
    const last90dConversions = Math.round(totalConv)
    const last90dSpendIls = Math.round(totalSpendMicros / 1_000_000)

    // ── Query 2: enabled conversion actions (full structure for Stage 8 mapping) ──
    const conversionsQuery = `
        SELECT conversion_action.id,
               conversion_action.resource_name,
               conversion_action.name,
               conversion_action.category,
               conversion_action.type,
               conversion_action.primary_for_goal,
               conversion_action.status,
               conversion_action.tag_snippets
        FROM conversion_action
        WHERE conversion_action.status = 'ENABLED'
    `
    const convRows = await gaqlStream(customerId, accessToken, developerToken, conversionsQuery, loginCustomerId)
        .catch(err => { throw new Error(`conversion_actions query failed: ${(err as Error).message}`) })

    const existingConversionActions: ExistingConversionAction[] = []
    for (const row of convRows) {
        const ca = row.conversionAction || row.conversion_action
        if (!ca) continue
        const idLabel = extractIdAndLabelFromSnippets(ca.tagSnippets || ca.tag_snippets || [])
        const name = String(ca.name || '')
        existingConversionActions.push({
            resourceName: String(ca.resourceName || ca.resource_name || ''),
            id: String(ca.id || ''),
            name,
            category: String(ca.category || ''),
            type: String(ca.type || ''),
            primaryForGoal: !!(ca.primaryForGoal ?? ca.primary_for_goal),
            last90dConv: 0,    // per-action 90d not aggregated here — keep account-level total
            googleAdsConversionId: idLabel?.conversionId,
            googleAdsConversionLabel: idLabel?.conversionLabel,
            isMazhirOwned: name.startsWith('Mazhir — '),
        })
    }

    return {
        connected: true,
        rootCustomerId,
        operatingCustomerId,
        loginCustomerId,
        activeCampaignsCount,
        last90dConversions,
        last90dSpendIls,
        existingConversionActions,
    }
}

function extractIdAndLabelFromSnippets(snippets: any[]): { conversionId: string; conversionLabel: string } | null {
    for (const snip of snippets || []) {
        const ev = String(snip.eventSnippet || snip.event_snippet || '')
        const m = ev.match(/AW-(\d+)\/([A-Za-z0-9_-]+)/)
        if (m) return { conversionId: m[1], conversionLabel: m[2] }
    }
    return null
}

// ═════════════════════════════════════════════════════════════════════════
// GTM discovery
// ═════════════════════════════════════════════════════════════════════════

async function discoverGtmState(inst: any): Promise<GtmSetupSignals> {
    const tokens: any = inst.googleTokens || {}
    const rd: any = inst.researchData || {}
    const target = rd.mazhirGtm?.target
    const siteUrl: string | undefined = rd.answers?.websiteUrl || rd.paidProfile?.websiteUrl

    // OAuth + scope check (we need at least readonly to discover)
    const tokenScopes: string[] = Array.isArray(tokens.scopes) ? tokens.scopes
        : (typeof tokens.scope === 'string' ? tokens.scope.split(' ') : [])
    const hasGtmScope = tokenScopes.some(s => s === 'gtm' || s.includes('tagmanager'))

    if (!tokens.refreshToken || !hasGtmScope) {
        return {
            connected: false,
            targetPicked: false,
            hasLiveVersion: false,
            liveVersionTagCount: 0,
            snippetInstalledOnSite: false,
            existingMazhirAutoWorkspaceCount: 0,
        }
    }

    if (!target?.containerId) {
        // Connected but no container picked yet
        return {
            connected: true,
            targetPicked: false,
            hasLiveVersion: false,
            liveVersionTagCount: 0,
            snippetInstalledOnSite: false,
            existingMazhirAutoWorkspaceCount: 0,
        }
    }

    const accessToken = await refreshAccessToken(tokens.refreshToken)
    if (!accessToken) {
        return {
            connected: true,
            targetPicked: true,
            accountId: target.accountId,
            containerId: target.containerId,
            publicId: target.publicId,
            containerName: target.name,
            hasLiveVersion: false,
            liveVersionTagCount: 0,
            snippetInstalledOnSite: false,
            existingMazhirAutoWorkspaceCount: 0,
            discoveryError: 'failed to refresh OAuth access token',
        }
    }

    // Live version check + workspace stale-count + site snippet detect (parallel)
    const [liveData, wsData, siteDet] = await Promise.all([
        gtmCall(`/accounts/${target.accountId}/containers/${target.containerId}:live`, accessToken),
        gtmCall(`/accounts/${target.accountId}/containers/${target.containerId}/workspaces`, accessToken),
        siteUrl ? detectGtmOnSite(siteUrl, target.publicId) : Promise.resolve({ detected: false, reason: 'no site URL configured' }),
    ])

    const hasLiveVersion = liveData.ok
    const liveTagCount = hasLiveVersion ? ((liveData.data?.tag || []).length) : 0
    const stale = (wsData.ok ? (wsData.data?.workspace || []) : [])
        .filter((w: any) => typeof w.name === 'string' && w.name.startsWith('mazhir-auto-'))

    return {
        connected: true,
        targetPicked: true,
        accountId: String(target.accountId),
        containerId: String(target.containerId),
        publicId: String(target.publicId || ''),
        containerName: String(target.name || ''),
        hasLiveVersion,
        liveVersionTagCount: liveTagCount,
        snippetInstalledOnSite: siteDet.detected,
        snippetInstallDetail: siteDet.reason,
        existingMazhirAutoWorkspaceCount: stale.length,
    }
}

async function detectGtmOnSite(siteUrl: string, publicId: string): Promise<{ detected: boolean; reason: string }> {
    if (!publicId) return { detected: false, reason: 'no publicId to search for' }
    try {
        let u = siteUrl.trim()
        if (!/^https?:\/\//.test(u)) u = 'https://' + u
        const res = await fetch(u, {
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FlowmaticBot/1.0; +https://flowmatic.co.il)' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!res.ok) return { detected: false, reason: `site returned ${res.status}` }
        const html = await res.text()
        const escaped = publicId.replace(/[-]/g, '\\-')
        const re = new RegExp(`(googletagmanager\\.com[\\s\\S]{0,400}${escaped})|(${escaped}[\\s\\S]{0,200}googletagmanager\\.com)`, 'i')
        return re.test(html)
            ? { detected: true, reason: `${publicId} found in HTML` }
            : { detected: false, reason: `${publicId} not in HTML (${html.length} bytes scanned)` }
    } catch (err) {
        return { detected: false, reason: `fetch failed: ${(err as Error).message}` }
    }
}

// ═════════════════════════════════════════════════════════════════════════
// GA4 discovery (minimal — scope check only for now)
// ═════════════════════════════════════════════════════════════════════════

async function discoverGa4State(inst: any): Promise<Ga4SetupSignals> {
    const tokens: any = inst.googleTokens || {}
    const rd: any = inst.researchData || {}
    const tokenScopes: string[] = Array.isArray(tokens.scopes) ? tokens.scopes
        : (typeof tokens.scope === 'string' ? tokens.scope.split(' ') : [])
    const hasGa4Scope = tokenScopes.some(s => s === 'analytics' || s.includes('analytics'))
    const measurementId: string | undefined = rd.mazhirGtm?.target?.measurementId
        || rd.ga4?.measurementId
        || undefined
    return { connected: hasGa4Scope, measurementId }
}

// ═════════════════════════════════════════════════════════════════════════
// Low-level helpers (OAuth refresh, GAds + GTM fetch)
// ═════════════════════════════════════════════════════════════════════════

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
    try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID || '',
                client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        const j = await res.json() as any
        return j.access_token || null
    } catch { return null }
}

async function gaqlStream(
    customerId: string,
    accessToken: string,
    developerToken: string,
    query: string,
    loginCustomerId?: string,
): Promise<any[]> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': developerToken,
    }
    if (loginCustomerId && loginCustomerId !== customerId) headers['login-customer-id'] = loginCustomerId
    const res = await fetch(`${GADS_API}/customers/${customerId}/googleAds:searchStream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 2),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`GAds ${res.status}: ${text.slice(0, 300)}`)
    let data: any
    try { data = JSON.parse(text) } catch { throw new Error(`GAds non-JSON: ${text.slice(0, 200)}`) }
    const rows: any[] = []
    const chunks = Array.isArray(data) ? data : [data]
    for (const chunk of chunks) {
        if (chunk.results) rows.push(...chunk.results)
    }
    return rows
}

async function gtmCall(path: string, accessToken: string, method = 'GET'): Promise<{ ok: boolean; status: number; data: any }> {
    try {
        const res = await fetch(`${GTM_API}${path}`, {
            method,
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        const text = await res.text()
        let data: any = {}
        try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
        return { ok: res.ok, status: res.status, data }
    } catch (err) {
        return { ok: false, status: 0, data: { error: (err as Error).message } }
    }
}