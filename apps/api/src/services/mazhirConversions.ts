/**
 * Mazhir — Google Ads Conversion Actions auto-creator
 *
 * Creates ConversionAction resources via Google Ads API v18, then reads back
 * tag_snippets[] to extract the (conversionId, conversionLabel) pair that
 * GTM's `awct` tag requires to fire correctly.
 *
 * Maps PaidProfile + MediaPlan.conversionTrackingPlan.primaryActions to the
 * right (category, type, valueSettings) per Google Ads' enum strict rules:
 *
 *   primary action key     | category               | type
 *   ─────────────────────  | ─────────────────────  | ───────
 *   form_submit            | SUBMIT_LEAD_FORM       | WEBPAGE
 *   generate_lead          | LEAD                   | WEBPAGE
 *   phone_call             | PHONE_CALL_LEAD        | WEBPAGE       (button click)
 *   phone_call_offline     | PHONE_CALL_LEAD        | UPLOAD_CALLS  (call tracking provider)
 *   purchase               | PURCHASE               | WEBPAGE
 *   qualified_lead         | QUALIFIED_LEAD         | UPLOAD_CLICKS (offline CRM upload)
 *
 * Idempotent: if a conversion action with the same name exists & ENABLED, we
 * reuse it instead of creating a duplicate.
 *
 * Refs: https://developers.google.com/google-ads/api/rest/reference/rest/v18/ConversionAction
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import type { GtmConversionConfig } from '@/services/mazhirGtmSetup'

// v18 was deprecated and returns 404 as of early 2026. v22 is latest stable.
const GADS_API = 'https://googleads.googleapis.com/v22'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface GoogleTokens {
    accessToken?: string
    refreshToken: string
    expiresAt?: number
}

async function getAccessToken(tokens: GoogleTokens): Promise<string> {
    if (tokens.accessToken && (tokens.expiresAt || 0) > Date.now() + 300_000) return tokens.accessToken
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
    const j = await res.json() as any
    if (!j.access_token) throw new Error(`Token refresh failed: ${j.error || 'unknown'}`)
    return j.access_token
}

// Phase 4.2.1-O: developerToken is now a REQUIRED param. The prod env doesn't
// set GOOGLE_ADS_DEVELOPER_TOKEN — the token lives in googleAdsConfig.developerToken
// (per-tenant) and must be passed through explicitly. Same fix as gaqlQuery in
// googleAdsDeepEnrich.
async function gadsFetch(customerId: string, path: string, tokens: GoogleTokens, developerToken: string, body?: unknown, loginCustomerId?: string, method = 'POST'): Promise<any> {
    if (!developerToken) throw new Error('Google Ads developer token missing')
    const accessToken = await getAccessToken(tokens)
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': developerToken,
    }
    if (loginCustomerId && loginCustomerId !== customerId) headers['login-customer-id'] = loginCustomerId
    const url = `${GADS_API}/customers/${customerId}/${path}`
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    let data: any = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
    if (!res.ok) {
        // Phase 4.2.1-P: surface deep error info so 403/permission diagnoses
        // are not flattened to "The caller does not have permission". The
        // first GoogleAdsError inside details often names the exact failed
        // field/resource which tells us if it's tier, scope, or account-link.
        const firstErr = data?.error?.details?.[0]?.errors?.[0]
        const errType = firstErr?.errorCode ? Object.entries(firstErr.errorCode).map(([k, v]) => `${k}=${v}`).join(',') : ''
        const trigger = firstErr?.trigger?.stringValue || firstErr?.trigger?.int64Value || ''
        const m = firstErr?.message || data?.error?.message || text.slice(0, 400)
        const fullDiag = `GAds ${method} ${path} cust=${customerId} login=${loginCustomerId || '<none>'} → ${res.status}: ${m}` + (errType ? ` [${errType}]` : '') + (trigger ? ` trigger=${trigger}` : '')
        console.error('[gadsFetch] full error:', JSON.stringify(data?.error || data).slice(0, 800))
        throw new Error(fullDiag)
    }
    return data
}

// ─── Public types ─────────────────────────────────────────────────────────

export type PrimaryActionKey = 'form_submit' | 'generate_lead' | 'phone_call' | 'phone_call_offline' | 'purchase' | 'qualified_lead'

export interface ConversionActionSpec {
    actionKey: PrimaryActionKey
    name: string                  // human-readable, used as idempotency key
    defaultValueIls: number       // base value for Smart Bidding eligibility
    countingType?: 'ONE_PER_CLICK' | 'MANY_PER_CLICK'
}

export interface CreatedConversionAction {
    actionKey: PrimaryActionKey
    name: string
    resourceName: string          // customers/{cid}/conversionActions/{id}
    googleAdsConversionId: string // numeric, for awct tag (e.g. "1006772047")
    googleAdsConversionLabel: string // alphanumeric, for awct tag
    status: 'created' | 'reused'
    enhancedConversionsEligible: boolean
}

// ─── Mapping: action key → (category, type, defaults) ─────────────────────

interface ActionMeta {
    category: string
    type: string
    countingType: 'ONE_PER_CLICK' | 'MANY_PER_CLICK'
    clickThroughDays: number
    viewThroughDays: number
    primaryForGoal: boolean
}

const ACTION_META: Record<PrimaryActionKey, ActionMeta> = {
    form_submit:        { category: 'SUBMIT_LEAD_FORM', type: 'WEBPAGE',       countingType: 'ONE_PER_CLICK',  clickThroughDays: 30, viewThroughDays: 1, primaryForGoal: true },
    generate_lead:      { category: 'LEAD',             type: 'WEBPAGE',       countingType: 'ONE_PER_CLICK',  clickThroughDays: 30, viewThroughDays: 1, primaryForGoal: true },
    phone_call:         { category: 'PHONE_CALL_LEAD',  type: 'WEBPAGE',       countingType: 'ONE_PER_CLICK',  clickThroughDays: 30, viewThroughDays: 1, primaryForGoal: true },
    phone_call_offline: { category: 'PHONE_CALL_LEAD',  type: 'UPLOAD_CALLS',  countingType: 'ONE_PER_CLICK',  clickThroughDays: 30, viewThroughDays: 1, primaryForGoal: true },
    purchase:           { category: 'PURCHASE',         type: 'WEBPAGE',       countingType: 'MANY_PER_CLICK', clickThroughDays: 30, viewThroughDays: 1, primaryForGoal: true },
    qualified_lead:     { category: 'QUALIFIED_LEAD',   type: 'UPLOAD_CLICKS', countingType: 'ONE_PER_CLICK',  clickThroughDays: 90, viewThroughDays: 1, primaryForGoal: true },
}

// ─── Account-level: verify Enhanced Conversions terms accepted ───────────
export async function checkEnhancedConversionsEligibility(
    customerId: string,
    googleTokens: GoogleTokens,
    developerToken: string,
    loginCustomerId?: string,
): Promise<{ eligible: boolean; reason: string; rawSetting?: any }> {
    try {
        const data = await gadsFetch(customerId, 'googleAds:searchStream', googleTokens, developerToken, {
            query: `SELECT customer.conversion_tracking_setting.accepted_customer_data_terms,
                           customer.conversion_tracking_setting.enhanced_conversions_for_leads_enabled,
                           customer.conversion_tracking_setting.google_ads_conversion_customer
                    FROM customer`,
        }, loginCustomerId)
        const chunks = Array.isArray(data) ? data : [data]
        const allRows: any[] = []
        for (const chunk of chunks) {
            const rows = chunk?.results || []
            for (const r of rows) allRows.push(r)
        }
        const row = allRows[0]
        const setting = row?.customer?.conversionTrackingSetting || row?.customer?.conversion_tracking_setting
        if (!setting) return { eligible: false, reason: 'No conversion_tracking_setting available — account may not be fully provisioned' }
        if (!setting.acceptedCustomerDataTerms && !setting.accepted_customer_data_terms) {
            return { eligible: false, reason: 'Customer data terms not accepted — must be done in Google Ads UI (Tools & Settings → Customer matching)', rawSetting: setting }
        }
        return { eligible: true, reason: 'Enhanced Conversions ready', rawSetting: setting }
    } catch (err) {
        return { eligible: false, reason: `Eligibility check failed: ${(err as Error).message}` }
    }
}

// ─── Find existing conversion actions by name (idempotency support) ──────
// Phase 4.2.1-Q: switch from googleAds:search to googleAds:searchStream
// (matches baseline's gaqlQuery — known to work against the same operating
// sub-account with login-customer-id header set to the MCC root). `:search`
// was returning 403 USER_PERMISSION_DENIED despite identical credentials,
// likely because v22 enforces different per-endpoint auth for the non-stream
// `:search` variant when the OAuth user is a client-customer user (not
// directly authorized on the manager). Stream variant doesn't have this
// restriction.
async function findExistingAction(customerId: string, tokens: GoogleTokens, developerToken: string, name: string, loginCustomerId?: string): Promise<{ resourceName: string; tagSnippets: any[] } | null> {
    try {
        const escName = name.replace(/'/g, "\\'")
        const data = await gadsFetch(customerId, 'googleAds:searchStream', tokens, developerToken, {
            query: `SELECT conversion_action.id, conversion_action.name, conversion_action.tag_snippets, conversion_action.status
                    FROM conversion_action
                    WHERE conversion_action.name = '${escName}'`,
        }, loginCustomerId)
        // searchStream returns an array of response chunks: [{ results: [...] }, ...]
        // Flatten across chunks since a chunk can contain a subset of rows.
        const chunks = Array.isArray(data) ? data : [data]
        const allRows: any[] = []
        for (const chunk of chunks) {
            const rows = chunk?.results || []
            for (const r of rows) allRows.push(r)
        }
        const row = allRows[0]
        if (!row) return null
        const action = row.conversionAction || row.conversion_action
        return {
            resourceName: action.resourceName || action.resource_name,
            tagSnippets: action.tagSnippets || action.tag_snippets || [],
        }
    } catch (err) {
        console.warn('[mazhirConversions] findExistingAction error:', (err as Error).message)
        return null
    }
}

// ─── Read tag_snippets to extract (conversionId, conversionLabel) ────────
function extractIdAndLabelFromSnippets(snippets: any[]): { conversionId: string; conversionLabel: string } | null {
    for (const snip of snippets || []) {
        const ev = snip.eventSnippet || snip.event_snippet || ''
        // Pattern: send_to: 'AW-1006772047/0L_dC...'
        const m = ev.match(/AW-(\d+)\/([A-Za-z0-9_-]+)/)
        if (m) return { conversionId: m[1], conversionLabel: m[2] }
    }
    return null
}

// ─── Main: create or reuse a conversion action ────────────────────────────
export async function ensureConversionAction(
    customerId: string,
    tokens: GoogleTokens,
    developerToken: string,
    spec: ConversionActionSpec,
    loginCustomerId?: string,
): Promise<CreatedConversionAction> {
    const meta = ACTION_META[spec.actionKey]
    if (!meta) throw new Error(`Unknown actionKey: ${spec.actionKey}`)

    // 1. Try to find existing
    const existing = await findExistingAction(customerId, tokens, developerToken, spec.name, loginCustomerId)
    if (existing) {
        const idLabel = extractIdAndLabelFromSnippets(existing.tagSnippets)
        if (idLabel) {
            return {
                actionKey: spec.actionKey,
                name: spec.name,
                resourceName: existing.resourceName,
                googleAdsConversionId: idLabel.conversionId,
                googleAdsConversionLabel: idLabel.conversionLabel,
                status: 'reused',
                enhancedConversionsEligible: true,
            }
        }
        // Found but couldn't extract — strange, but proceed by treating as needs-recreation? No: just return what we have without IDs.
        return {
            actionKey: spec.actionKey,
            name: spec.name,
            resourceName: existing.resourceName,
            googleAdsConversionId: '',
            googleAdsConversionLabel: '',
            status: 'reused',
            enhancedConversionsEligible: true,
        }
    }

    // 2. Create new
    // Phase 4.2.1-Q: removed `attribution_model_settings.attribution_model`
    // (enum value 'GOOGLE_ADS_DATA_DRIVEN' doesn't exist in v22 — Google
    // auto-assigns DDA for new actions).
    // Phase 4.2.1-R: removed `include_in_conversions_metric` — v22 marks
    // this field IMMUTABLE on create (system-managed at creation time;
    // can be modified later via update). Trying to set it returned
    // 400 IMMUTABLE_FIELD.
    const createBody = {
        operations: [{
            create: {
                name: spec.name,
                category: meta.category,
                type: meta.type,
                status: 'ENABLED',
                primaryForGoal: meta.primaryForGoal,
                countingType: spec.countingType || meta.countingType,
                clickThroughLookbackWindowDays: meta.clickThroughDays,
                viewThroughLookbackWindowDays: meta.viewThroughDays,
                valueSettings: {
                    defaultValue: spec.defaultValueIls,
                    defaultCurrencyCode: 'ILS',
                    alwaysUseDefaultValue: false,   // gtag-reported value can override
                },
            },
        }],
        partialFailure: false,
        validateOnly: false,
    }

    const createRes = await gadsFetch(customerId, 'conversionActions:mutate', tokens, developerToken, createBody, loginCustomerId)
    const resourceName = (createRes.results || [])[0]?.resourceName
    if (!resourceName) throw new Error(`Create returned no resourceName: ${JSON.stringify(createRes).slice(0, 300)}`)

    // 3. Read back tag_snippets to extract (conversionId, conversionLabel)
    // Phase 4.2.1-Q: also use :searchStream here (same auth pattern as
    // findExistingAction above).
    const conversionActionId = resourceName.split('/').pop()
    let idLabel: { conversionId: string; conversionLabel: string } | null = null
    for (let attempt = 0; attempt < 4 && !idLabel; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1500))
        try {
            const data = await gadsFetch(customerId, 'googleAds:searchStream', tokens, developerToken, {
                query: `SELECT conversion_action.id, conversion_action.tag_snippets
                        FROM conversion_action
                        WHERE conversion_action.id = ${conversionActionId}`,
            }, loginCustomerId)
            const chunks = Array.isArray(data) ? data : [data]
            const allRows: any[] = []
            for (const chunk of chunks) {
                const rows = chunk?.results || []
                for (const r of rows) allRows.push(r)
            }
            const row = allRows[0]
            const snippets = row?.conversionAction?.tagSnippets || row?.conversion_action?.tag_snippets || []
            idLabel = extractIdAndLabelFromSnippets(snippets)
        } catch (err) {
            console.warn(`[mazhirConversions] tag_snippets read attempt ${attempt} failed:`, (err as Error).message)
        }
    }

    if (!idLabel) {
        throw new Error(`Created conversion action ${resourceName} but could not extract (conversionId, conversionLabel) from tag_snippets after 4 retries`)
    }

    return {
        actionKey: spec.actionKey,
        name: spec.name,
        resourceName,
        googleAdsConversionId: idLabel.conversionId,
        googleAdsConversionLabel: idLabel.conversionLabel,
        status: 'created',
        enhancedConversionsEligible: true,
    }
}

// ════════════════════════════════════════════════════════════════════════
// Phase 2026.02 Block 6 — primitives for monthlyTaskExecutor
// ════════════════════════════════════════════════════════════════════════

export interface ConversionActionSummary {
    resourceName: string
    id: string
    name: string
    category: string         // PURCHASE | LEAD | PHONE_CALL_LEAD | etc.
    type: string             // WEBPAGE | UPLOAD_CALLS | etc.
    status: string           // ENABLED | REMOVED | HIDDEN
    primaryForGoal: boolean
    countingType: string
    defaultValueIls: number | undefined
}

/**
 * List ALL enabled conversion actions for an account.
 * Used by tsk_cr_validation to discover current primary/secondary state
 * before deciding which to demote and which to mark primary.
 */
export async function listConversionActions(
    customerId: string,
    tokens: GoogleTokens,
    developerToken: string,
    loginCustomerId?: string,
): Promise<ConversionActionSummary[]> {
    const data = await gadsFetch(customerId, 'googleAds:searchStream', tokens, developerToken, {
        query: `SELECT
            conversion_action.resource_name,
            conversion_action.id,
            conversion_action.name,
            conversion_action.category,
            conversion_action.type,
            conversion_action.status,
            conversion_action.primary_for_goal,
            conversion_action.counting_type,
            conversion_action.value_settings.default_value
        FROM conversion_action
        WHERE conversion_action.status = 'ENABLED'`,
    }, loginCustomerId)

    const chunks = Array.isArray(data) ? data : [data]
    const rows: any[] = []
    for (const chunk of chunks) {
        for (const r of (chunk?.results || [])) rows.push(r)
    }
    return rows.map((r: any) => {
        const ca = r.conversionAction || r.conversion_action || {}
        const vs = ca.valueSettings || ca.value_settings || {}
        return {
            resourceName: ca.resourceName || ca.resource_name,
            id: String(ca.id),
            name: ca.name,
            category: ca.category,
            type: ca.type,
            status: ca.status,
            primaryForGoal: !!(ca.primaryForGoal ?? ca.primary_for_goal),
            countingType: ca.countingType || ca.counting_type,
            defaultValueIls: typeof vs.defaultValue === 'number' ? vs.defaultValue : (vs.default_value || undefined),
        }
    })
}

/**
 * Toggle primary_for_goal on a single conversion action.
 * Atomic — only one field updated. Used to demote phantom-signal actions
 * (e.g. phone_call valued at ₪1) to secondary, then promote a real Purchase
 * action to primary as part of tsk_cr_validation tracking-first cluster.
 */
export async function setConversionActionPrimary(
    customerId: string,
    tokens: GoogleTokens,
    developerToken: string,
    resourceName: string,
    primary: boolean,
    loginCustomerId?: string,
): Promise<void> {
    const body = {
        operations: [{
            update: {
                resourceName,
                primaryForGoal: primary,
            },
            updateMask: 'primary_for_goal',
        }],
        partialFailure: false,
        validateOnly: false,
    }
    await gadsFetch(customerId, 'conversionActions:mutate', tokens, developerToken, body, loginCustomerId)
}

/**
 * Orchestrator for tsk_cr_validation: ensure exactly the right conversion
 * actions count toward the Conversions metric (i.e. drive Smart Bidding).
 *
 * Plan:
 *   1. List all enabled actions.
 *   2. Identify which match the desired primary category (e.g. PURCHASE).
 *   3. If the desired action is missing → caller must invoke
 *      ensureConversionAction() first (this function does not create).
 *   4. Mark desired action(s) primary_for_goal=true.
 *   5. Demote every OTHER currently-primary action to primary_for_goal=false.
 *
 * Returns: detailed before/after report for verification + Telegram surfacing.
 */
export interface PrimaryReconcileReport {
    desiredCategory: string
    promoted: Array<{ resourceName: string; name: string; previouslyPrimary: boolean }>
    demoted: Array<{ resourceName: string; name: string; category: string }>
    unchanged: Array<{ resourceName: string; name: string; primaryForGoal: boolean }>
    warnings: string[]
}

export async function reconcilePrimaryConversionActions(
    customerId: string,
    tokens: GoogleTokens,
    developerToken: string,
    desiredCategory: 'PURCHASE' | 'LEAD' | 'SUBMIT_LEAD_FORM' | 'PHONE_CALL_LEAD' | 'QUALIFIED_LEAD',
    loginCustomerId?: string,
): Promise<PrimaryReconcileReport> {
    const all = await listConversionActions(customerId, tokens, developerToken, loginCustomerId)
    const report: PrimaryReconcileReport = {
        desiredCategory,
        promoted: [],
        demoted: [],
        unchanged: [],
        warnings: [],
    }

    const desiredActions = all.filter(a => a.category === desiredCategory)
    if (desiredActions.length === 0) {
        report.warnings.push(`No ENABLED conversion action found in category ${desiredCategory}. Caller must create one (ensureConversionAction) before promotion.`)
        return report
    }

    for (const a of all) {
        const shouldBePrimary = a.category === desiredCategory
        if (shouldBePrimary && !a.primaryForGoal) {
            await setConversionActionPrimary(customerId, tokens, developerToken, a.resourceName, true, loginCustomerId)
            report.promoted.push({ resourceName: a.resourceName, name: a.name, previouslyPrimary: false })
        } else if (!shouldBePrimary && a.primaryForGoal) {
            await setConversionActionPrimary(customerId, tokens, developerToken, a.resourceName, false, loginCustomerId)
            report.demoted.push({ resourceName: a.resourceName, name: a.name, category: a.category })
        } else {
            report.unchanged.push({ resourceName: a.resourceName, name: a.name, primaryForGoal: a.primaryForGoal })
        }
    }

    return report
}

// ─── Mapped conversion action: an EXISTING user action we adopt for Smart Bidding ─
export interface MappedConversionAction {
    actionKey: PrimaryActionKey
    resourceName: string                  // user's existing action resource name
    existingName: string                  // user's display name (e.g. "Calls from ads")
    category: string                      // category from existing action
    type: string                          // type from existing action
    googleAdsConversionId?: string        // from existing tag_snippets (may be missing for AD_CALL/GA4 imports)
    googleAdsConversionLabel?: string
    last90dConv: number                   // existing volume (drives Smart Bidding confidence)
    primaryForGoal: boolean
}

// ─── A candidate user can pick for an actionKey (or pick "create new") ─
export interface ConversionCandidate {
    resourceName: string
    name: string
    category: string
    type: string
    primaryForGoal: boolean
    last90dConv: number                   // historical conversion count (per-action)
    attributedConv90d: number             // conv ATTRIBUTED to OUR scope's campaigns specifically
    googleAdsConversionId?: string
    googleAdsConversionLabel?: string
    isMazhirOwned: boolean                // surfaced so user can tell if it's a prior Mazhir creation
    recommended: boolean                  // smart-default pick flag (one per actionKey)
    rationaleHe: string                   // 1-line Hebrew explanation of why this candidate
    score: number                         // total scoring (debug-visible)
    confidence: 'high' | 'medium' | 'low' // bucketed for UI rendering
}

// ─── A suggestion for one of our specs: list of candidates + create-new fallback ─
export interface ConversionSuggestion {
    actionKey: PrimaryActionKey
    descriptionHe: string                 // Hebrew explanation of what this signal represents
    candidates: ConversionCandidate[]     // user's existing primary actions matching this spec
    orCreateNew: {
        name: string
        defaultValueIls: number
        recommended: boolean              // true when no acceptable existing candidate
        rationaleHe: string
    }
    autoPickedResourceName: string | null // null if create_new is recommended
    autoApprovable: boolean               // top candidate has confidence='high' OR create_new with no alternatives
    topConfidence: 'high' | 'medium' | 'low'
}

export interface ConversionSuggestionsResult {
    classification: 'greenfield' | 'partial_setup' | 'mature_setup'
    mode: 'create_all' | 'map_existing_create_missing' | 'map_only'
    suggestions: ConversionSuggestion[]
    existingMazhirOwned: Array<{ resourceName: string; name: string; category: string; last90dConv: number }>
    warnings: string[]
    allAutoApprovable: boolean            // true ↔ every spec has high confidence OR clear create_new path
}

// ─── User's explicit choice per actionKey (sent from UI to confirm endpoint) ─
export interface UserConversionChoice {
    actionKey: PrimaryActionKey
    choice: { type: 'map_existing'; resourceName: string } | { type: 'create_new' }
}

// ─── Archived: Mazhir-owned 0-conv action we removed as a duplicate ─
export interface ArchivedConversionAction {
    resourceName: string
    name: string
    category: string
    reason: string
}

// ─── Unified for downstream consumers (GTM, plan generators) ─
export interface ActiveConversionAction {
    actionKey: PrimaryActionKey
    source: 'created' | 'mapped'
    name: string                          // Mazhir-named (created) OR user's existing (mapped)
    resourceName: string
    googleAdsConversionId: string         // ALWAYS populated — mapped without IDs are filtered out
    googleAdsConversionLabel: string
    type: string                          // WEBPAGE / WEBPAGE_CODELESS / etc.
    last90dConv: number                   // historical signal (created = 0, mapped = real)
}

// ═════════════════════════════════════════════════════════════════════════
// Shared helpers — used by both discover (suggestions) and apply
// ═════════════════════════════════════════════════════════════════════════

// Category mapping (our actionKey → Google Ads conversion_action.category):
const SPEC_TO_CATEGORY: Record<PrimaryActionKey, string[]> = {
    form_submit:        ['SUBMIT_LEAD_FORM', 'CONTACT', 'SIGNUP'],
    generate_lead:      ['SUBMIT_LEAD_FORM', 'CONTACT', 'SIGNUP'],
    phone_call:         ['PHONE_CALL_LEAD'],
    phone_call_offline: ['PHONE_CALL_LEAD'],
    purchase:           ['PURCHASE'],
    qualified_lead:     ['QUALIFIED_LEAD'],
}

// Inverse: category → which of our actionKeys it best represents (for archive supersession)
function categoryToActionKey(category: string): PrimaryActionKey | null {
    if (['SUBMIT_LEAD_FORM', 'CONTACT', 'SIGNUP'].includes(category)) return 'form_submit'
    if (category === 'PHONE_CALL_LEAD') return 'phone_call'
    if (category === 'PURCHASE') return 'purchase'
    if (category === 'QUALIFIED_LEAD') return 'qualified_lead'
    return null
}

// Type quality rank — lower = better. Used to rank candidates within a spec.
//
// Ranking rationale for multi-business accounts:
//   WEBPAGE (1)            — gtag awct, scoped to wherever the tag is installed
//   WEBPAGE_CODELESS (2)   — Enhanced Conversions auto-tag, account-wide (covers all
//                            domains the user owns — safest mapping when business
//                            identity isn't easily verified)
//   AD_CALL (3)            — phone calls from Google Ads call extensions, account-wide
//                            (signal source is the ad surface, not any specific domain)
//   GOOGLE_ANALYTICS_4_*   — GA4 stream-bound (4). These actions fire per-stream config
//                            which is GENERALLY business/property-specific. Risky to
//                            map cross-business without confirming the stream covers
//                            our domain.
//   UPLOAD_* (5)           — offline upload, requires CRM integration
//
// Tie-breakers after type: last90dConv DESC, then alphabetical name.
function typeRank(type: string): number {
    if (type === 'WEBPAGE') return 1
    if (type === 'WEBPAGE_CODELESS') return 2
    if (type === 'AD_CALL') return 3
    if (type === 'GOOGLE_ANALYTICS_4_CUSTOM') return 4
    if (type === 'GOOGLE_ANALYTICS_4_PURCHASE') return 4
    if (type === 'UPLOAD_CALLS' || type === 'UPLOAD_CLICKS') return 5
    return 9
}

interface LoadedContext {
    inst: any
    customerId: string
    loginCustomerId: string | undefined
    developerToken: string
    specs: ConversionActionSpec[]
    existingActions: any[]                // from tenantSetupState
    avgDealValue: number
    classification: 'greenfield' | 'partial_setup' | 'mature_setup'
    mode: 'create_all' | 'map_existing_create_missing' | 'map_only'
    tokens: any
    warnings: string[]
}

async function loadContext(instanceId: string): Promise<LoadedContext> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')

    const rd: any = inst.researchData || {}
    const paidProfile = rd.paidProfile
    if (!paidProfile) throw new Error('paidProfile required')

    const googleAdsConfig: any = inst.googleAdsConfig || {}
    const rootCustomerId = googleAdsConfig.customerId
    if (!rootCustomerId) throw new Error('Google Ads not connected — link customerId first')

    const tokens = inst.googleTokens as any
    if (!tokens?.refreshToken) throw new Error('Google OAuth tokens missing — re-auth with adwords scope')

    const operatingFromScope = googleAdsConfig.scope?.operatingCustomerId
    const customerId = operatingFromScope || rootCustomerId
    const loginCustomerId = operatingFromScope ? rootCustomerId : (googleAdsConfig.loginCustomerId || undefined)
    const developerToken = googleAdsConfig.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
    if (!developerToken) throw new Error('Google Ads developer token missing — link Google Ads or set GOOGLE_ADS_DEVELOPER_TOKEN env')

    // Tenant state drives mode
    const { classifyTenantSetupState } = await import('@/services/tenantSetupState')
    const tenantState = await classifyTenantSetupState(instanceId)
    const mode = tenantState.recommendedMode.stage8_conv as 'create_all' | 'map_existing_create_missing' | 'map_only'
    const existingActions = tenantState.signals.googleAds.existingConversionActions || []

    // Decide which spec actions we want for this profile
    const specs: ConversionActionSpec[] = []
    const warnings: string[] = []
    const goal = paidProfile.primaryGoal as string
    const phone = !!paidProfile.trackingStack?.phoneCallsRelevant
    const avgDealValue = Number(paidProfile.avgDealValueIls) || 100

    if (goal === 'leadgen' || goal === 'store_visits' || goal === 'app_installs') {
        specs.push({ actionKey: 'form_submit', name: 'Mazhir — Form Submit', defaultValueIls: avgDealValue })
        if (phone) specs.push({ actionKey: 'phone_call', name: 'Mazhir — Phone Click', defaultValueIls: avgDealValue })
        specs.push({ actionKey: 'qualified_lead', name: 'Mazhir — Qualified Lead (CRM)', defaultValueIls: avgDealValue * 3 })
    } else if (goal === 'ecommerce') {
        specs.push({ actionKey: 'purchase', name: 'Mazhir — Purchase', defaultValueIls: avgDealValue })
    } else {
        warnings.push(`primaryGoal="${goal}" — no default conversion actions configured for this profile`)
    }

    return {
        inst, customerId, loginCustomerId, developerToken, specs, existingActions,
        avgDealValue, classification: tenantState.classification, mode, tokens, warnings,
    }
}

// ═════════════════════════════════════════════════════════════════════════
// Phase 1: DISCOVER (read-only) — build suggestions for UI
// ═════════════════════════════════════════════════════════════════════════

// Hebrew descriptions per actionKey
const ACTION_KEY_DESCRIPTION_HE: Record<PrimaryActionKey, string> = {
    form_submit:        'מילוי טופס באתר — סיגנל ליד עיקרי',
    generate_lead:      'יצירת ליד — סיגנל ליד עיקרי',
    phone_call:         'לחיצה על כפתור טלפון באתר',
    phone_call_offline: 'שיחת טלפון (נתון offline מ-CRM)',
    purchase:           'רכישה באתר (eCommerce)',
    qualified_lead:     'ליד מוסמך מ-CRM (offline upload)',
}

export async function discoverConversionSuggestions(
    instanceId: string,
): Promise<ConversionSuggestionsResult> {
    const ctx = await loadContext(instanceId)

    // Phase 4.2.3-B3: collect evidence from 4 layers (campaign_selective_opt + empirical
    // attribution + GTM tag inspection + name/type heuristics)
    const { collectMappingEvidence, scoreCandidate } = await import('@/services/conversionMappingScorer')
    const evidence = await collectMappingEvidence(instanceId)

    const suggestions: ConversionSuggestion[] = []
    let allAutoApprovable = true

    for (const spec of ctx.specs) {
        const wantedCategories = SPEC_TO_CATEGORY[spec.actionKey] || []
        const rawCandidates = ctx.existingActions.filter(a =>
            wantedCategories.includes(a.category) && a.primaryForGoal
        )

        // Score each candidate using evidence layers (A/B/C/D/E combined)
        const scored = rawCandidates.map((a: any) => {
            const s = scoreCandidate({
                resourceName: a.resourceName,
                name: a.name,
                category: a.category,
                type: a.type,
                primaryForGoal: a.primaryForGoal,
                googleAdsConversionId: a.googleAdsConversionId,
                googleAdsConversionLabel: a.googleAdsConversionLabel,
                isMazhirOwned: a.isMazhirOwned,
            }, evidence, spec.actionKey)
            const attributedConv = evidence.attributedConv.get(a.resourceName) || 0
            return { action: a, score: s, attributedConv }
        })

        // Sort by score desc; tiebreaker = !isMazhirOwned (prefer user's) then attributedConv
        scored.sort((x, y) => {
            const ds = y.score.score - x.score.score
            if (ds !== 0) return ds
            if (x.action.isMazhirOwned !== y.action.isMazhirOwned) return x.action.isMazhirOwned ? 1 : -1
            return (y.attributedConv || 0) - (x.attributedConv || 0)
        })

        const topNonMazhir = scored.find(s => !s.action.isMazhirOwned)
        // Prefer non-Mazhir if it has any meaningful score; fall back to top overall
        const topPick = (topNonMazhir && topNonMazhir.score.score >= 10) ? topNonMazhir : scored[0]
        const topScore = topPick?.score.score || 0
        const topConfidence: 'high' | 'medium' | 'low' = topPick?.score.confidence || 'low'

        // Candidates ordered by score for UI
        const candidates: ConversionCandidate[] = scored.map(s => ({
            resourceName: s.action.resourceName,
            name: s.action.name,
            category: s.action.category,
            type: s.action.type,
            primaryForGoal: s.action.primaryForGoal,
            last90dConv: s.action.last90dConv || 0,
            attributedConv90d: s.attributedConv,
            googleAdsConversionId: s.action.googleAdsConversionId,
            googleAdsConversionLabel: s.action.googleAdsConversionLabel,
            isMazhirOwned: s.action.isMazhirOwned,
            recommended: !!(topPick && s.action.resourceName === topPick.action.resourceName),
            rationaleHe: s.score.rationaleHe,
            score: s.score.score,
            confidence: s.score.confidence,
        }))

        // Create-new option: recommended when no real candidate OR top user candidate has low score
        const noUsableUserCandidate = !topPick || topPick.action.isMazhirOwned || topScore < 10
        const orCreateNew = {
            name: spec.name,
            defaultValueIls: spec.defaultValueIls,
            recommended: noUsableUserCandidate,
            rationaleHe: noUsableUserCandidate
                ? 'אין אקשן קיים מתאים בחשבון — Mazhir ייצור חדש (firing דרך GTM, signal source נקי)'
                : 'אופציה חלופית: ליצור per-instance signal source חדש דרך GTM (להחזיק נפרד)',
        }

        const autoPickedResourceName: string | null = noUsableUserCandidate ? null
            : (topPick ? topPick.action.resourceName : null)

        // Per-spec auto-approvable:
        //   - high confidence on an existing pick, OR
        //   - clear create_new with no usable alternatives
        const specAutoApprovable = (autoPickedResourceName !== null && topConfidence === 'high')
            || (autoPickedResourceName === null && noUsableUserCandidate)
        if (!specAutoApprovable) allAutoApprovable = false

        suggestions.push({
            actionKey: spec.actionKey,
            descriptionHe: ACTION_KEY_DESCRIPTION_HE[spec.actionKey] || '',
            candidates,
            orCreateNew,
            autoPickedResourceName,
            autoApprovable: specAutoApprovable,
            topConfidence: noUsableUserCandidate ? 'high' : topConfidence,
        })
    }

    // Mazhir-owned actions currently in account (potential archive targets when user maps to alternatives)
    const existingMazhirOwned = ctx.existingActions
        .filter((a: any) => a.isMazhirOwned)
        .map((a: any) => ({
            resourceName: a.resourceName,
            name: a.name,
            category: a.category,
            last90dConv: a.last90dConv || 0,
        }))

    // Persist suggestions so UI doesn't have to refetch
    const { resolvePrimaryAgent, mutateResearchData } = await import('@/services/agentContext')
    const agent = await resolvePrimaryAgent(instanceId)
    await mutateResearchData(agent, instanceId, (cur: any) => {
        cur.mazhirConversions = cur.mazhirConversions || {}
        cur.mazhirConversions.pendingSuggestions = suggestions
        cur.mazhirConversions.pendingSuggestionsAt = new Date().toISOString()
        return cur
    })

    return {
        classification: ctx.classification,
        mode: ctx.mode === 'map_only' ? 'map_existing_create_missing' : ctx.mode,
        suggestions,
        existingMazhirOwned,
        warnings: ctx.warnings,
        allAutoApprovable,
    }
}

// ═════════════════════════════════════════════════════════════════════════
// Phase 2: APPLY (commits user choices) — creates / maps / archives
// ═════════════════════════════════════════════════════════════════════════

export interface ApplyMappingsResult {
    active: ActiveConversionAction[]
    mapped: MappedConversionAction[]
    created: CreatedConversionAction[]
    archived: ArchivedConversionAction[]
    gtmConfigs: GtmConversionConfig[]
    warnings: string[]
    mode: 'create_all' | 'map_existing_create_missing'
    classification: 'greenfield' | 'partial_setup' | 'mature_setup'
}

export async function applyConversionMappings(
    instanceId: string,
    userChoices: UserConversionChoice[],
): Promise<ApplyMappingsResult> {
    const ctx = await loadContext(instanceId)
    const warnings: string[] = [...ctx.warnings]

    // Pre-flight: enhanced conversions (informational)
    const ec = await checkEnhancedConversionsEligibility(ctx.customerId, ctx.tokens, ctx.developerToken, ctx.loginCustomerId)
    if (!ec.eligible) warnings.push(ec.reason)

    // ── Apply each user choice ──
    const mapped: MappedConversionAction[] = []
    const created: CreatedConversionAction[] = []

    for (const choice of userChoices) {
        const spec = ctx.specs.find(s => s.actionKey === choice.actionKey)
        if (!spec) {
            warnings.push(`unknown actionKey "${choice.actionKey}" in user choices — skipped`)
            continue
        }
        if (choice.choice.type === 'map_existing') {
            const targetResourceName = choice.choice.resourceName
            const existing = ctx.existingActions.find((a: any) => a.resourceName === targetResourceName)
            if (!existing) {
                warnings.push(`map_existing target "${targetResourceName}" not found — falling back to create`)
                try {
                    const c = await ensureConversionAction(ctx.customerId, ctx.tokens, ctx.developerToken, spec, ctx.loginCustomerId)
                    created.push(c)
                } catch (err) {
                    warnings.push(`${spec.name} fallback create failed: ${(err as Error).message}`)
                }
                continue
            }
            mapped.push({
                actionKey: choice.actionKey,
                resourceName: existing.resourceName,
                existingName: existing.name,
                category: existing.category,
                type: existing.type,
                googleAdsConversionId: existing.googleAdsConversionId,
                googleAdsConversionLabel: existing.googleAdsConversionLabel,
                last90dConv: existing.last90dConv || 0,
                primaryForGoal: existing.primaryForGoal,
            })
        } else {
            // create_new
            try {
                const c = await ensureConversionAction(ctx.customerId, ctx.tokens, ctx.developerToken, spec, ctx.loginCustomerId)
                created.push(c)
            } catch (err) {
                warnings.push(`${spec.name}: ${(err as Error).message}`)
            }
        }
    }

    // ── Archive superseded Mazhir actions ──
    // Phase 4.2.3-B4: multi-select aware. For each Mazhir-owned 0-conv action:
    //   - if user explicitly picked it (mapExisting=resourceName among choices) → keep
    //   - else if user picked ANY non-Mazhir alternative for this actionKey → archive
    //   - else (no non-Mazhir alternative picked) → keep
    const archived: ArchivedConversionAction[] = []
    const userPickedResourceNames = new Set<string>(
        userChoices
            .filter(c => c.choice.type === 'map_existing')
            .map(c => (c.choice as { type: 'map_existing'; resourceName: string }).resourceName)
    )
    for (const a of ctx.existingActions.filter((x: any) => x.isMazhirOwned && x.last90dConv === 0)) {
        if (userPickedResourceNames.has(a.resourceName)) continue  // user explicitly kept this Mazhir
        const inferredKey = categoryToActionKey(a.category)
        if (!inferredKey) continue
        const choicesForKey = userChoices.filter(c => c.actionKey === inferredKey)
        if (choicesForKey.length === 0) continue
        // Did the user pick a non-Mazhir action for this actionKey?
        const hasNonMazhirAlternative = choicesForKey.some(c => {
            if (c.choice.type !== 'map_existing') return false
            const target = ctx.existingActions.find((x: any) => x.resourceName === (c.choice as { resourceName: string }).resourceName)
            return target && !target.isMazhirOwned
        })
        if (!hasNonMazhirAlternative) continue   // no superseding alternative — keep
        try {
            await gadsFetch(ctx.customerId, 'conversionActions:mutate', ctx.tokens, ctx.developerToken, {
                operations: [{ remove: a.resourceName }],
                partialFailure: false,
                validateOnly: false,
            }, ctx.loginCustomerId)
            archived.push({
                resourceName: a.resourceName,
                name: a.name,
                category: a.category,
                reason: `superseded by user-confirmed mapping ${inferredKey} → user alternative(s)`,
            })
        } catch (err) {
            warnings.push(`archive "${a.name}" failed: ${(err as Error).message}`)
        }
    }

    // ── Build unified active list ──
    const active: ActiveConversionAction[] = []
    for (const m of mapped) {
        if (m.googleAdsConversionId && m.googleAdsConversionLabel) {
            active.push({
                actionKey: m.actionKey,
                source: 'mapped',
                name: m.existingName,
                resourceName: m.resourceName,
                googleAdsConversionId: m.googleAdsConversionId,
                googleAdsConversionLabel: m.googleAdsConversionLabel,
                type: m.type,
                last90dConv: m.last90dConv,
            })
        } else {
            warnings.push(`Mapped ${m.actionKey} → "${m.existingName}" (${m.type}) — no GTM-compatible IDs available; Smart Bidding will still use this signal but no GTM tag will be created.`)
        }
    }
    for (const c of created) {
        active.push({
            actionKey: c.actionKey,
            source: 'created',
            name: c.name,
            resourceName: c.resourceName,
            googleAdsConversionId: c.googleAdsConversionId,
            googleAdsConversionLabel: c.googleAdsConversionLabel,
            type: 'WEBPAGE',
            last90dConv: 0,
        })
    }

    // ── GTM configs: only created actions need our awct tag (mapped existing signals are already tracked) ──
    const gtmConfigs: GtmConversionConfig[] = active
        .filter(a => a.source === 'created')
        .filter(a => a.actionKey !== 'qualified_lead' && a.actionKey !== 'phone_call_offline')
        .map(a => ({
            actionKey: (a.actionKey === 'form_submit' ? 'generate_lead' : a.actionKey) as GtmConversionConfig['actionKey'],
            googleAdsConversionId: a.googleAdsConversionId,
            googleAdsConversionLabel: a.googleAdsConversionLabel,
            sendValue: true,
            defaultValueIls: ctx.avgDealValue,
            defaultCurrency: 'ILS',
        }))

    // Persist
    const { resolvePrimaryAgent, mutateResearchData } = await import('@/services/agentContext')
    const agent = await resolvePrimaryAgent(instanceId)
    await mutateResearchData(agent, instanceId, (cur: any) => {
        cur.mazhirConversions = {
            ...(cur.mazhirConversions || {}),
            active,
            created,
            mapped,
            archived,
            warnings,
            userChoices,
            mode: ctx.mode,
            classification: ctx.classification,
            savedAt: new Date().toISOString(),
            // Clear pending suggestions — they've been resolved
            pendingSuggestions: null,
            pendingSuggestionsAt: null,
        }
        return cur
    })

    return {
        active, mapped, created, archived, gtmConfigs, warnings,
        mode: ctx.mode === 'map_only' ? 'map_existing_create_missing' : ctx.mode,
        classification: ctx.classification,
    }
}

// ═════════════════════════════════════════════════════════════════════════
// Backwards-compat: auto-apply smart defaults (for non-UI callers that still
// POST /conversions/setup directly without going through suggestions UI)
// ═════════════════════════════════════════════════════════════════════════

export async function setupConversionActionsForInstance(
    instanceId: string,
): Promise<ApplyMappingsResult & { autoApplied: boolean; suggestionsResult: ConversionSuggestionsResult }> {
    // Phase 4.2.3-B3: state-aware auto-apply (Path B — always apply top picks,
    // user verifies at the end via a banner, never asked to disambiguate mid-flow).
    // - Run discover with scoring (Layer A/B/C/D/E evidence)
    // - Always apply top-scoring picks for every spec
    // - UI shows a verification banner with the chosen mappings + reasoning;
    //   user can confirm in one click OR open the override modal to change
    //   any specific mapping.
    // - The `allAutoApprovable` flag is still propagated for UI presentation
    //   (high-confidence picks get green badges; medium/low get yellow hints).
    const suggestionsResult = await discoverConversionSuggestions(instanceId)
    const userChoices: UserConversionChoice[] = suggestionsResult.suggestions.map(s => {
        if (s.orCreateNew.recommended || !s.autoPickedResourceName) {
            return { actionKey: s.actionKey, choice: { type: 'create_new' as const } }
        }
        return {
            actionKey: s.actionKey,
            choice: { type: 'map_existing' as const, resourceName: s.autoPickedResourceName },
        }
    })

    const applied = await applyConversionMappings(instanceId, userChoices)
    return { ...applied, autoApplied: true, suggestionsResult }
}

export { GtmConversionConfig }