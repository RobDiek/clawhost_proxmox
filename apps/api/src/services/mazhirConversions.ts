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

async function gadsFetch(customerId: string, path: string, tokens: GoogleTokens, body?: unknown, loginCustomerId?: string, method = 'POST'): Promise<any> {
    const accessToken = await getAccessToken(tokens)
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId
    const url = `${GADS_API}/customers/${customerId}/${path}`
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    let data: any = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
    if (!res.ok) {
        const m = data?.error?.message || data?.error?.details?.[0]?.errors?.[0]?.message || text.slice(0, 400)
        throw new Error(`GAds ${method} ${path} → ${res.status}: ${m}`)
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
    loginCustomerId?: string,
): Promise<{ eligible: boolean; reason: string; rawSetting?: any }> {
    try {
        const data = await gadsFetch(customerId, 'googleAds:search', googleTokens, {
            query: `SELECT customer.conversion_tracking_setting.accepted_customer_data_terms,
                           customer.conversion_tracking_setting.enhanced_conversions_for_leads_enabled,
                           customer.conversion_tracking_setting.google_ads_conversion_customer
                    FROM customer`,
        }, loginCustomerId)
        const row = (data.results || data?.[0]?.results)?.[0]
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
async function findExistingAction(customerId: string, tokens: GoogleTokens, name: string, loginCustomerId?: string): Promise<{ resourceName: string; tagSnippets: any[] } | null> {
    try {
        const escName = name.replace(/'/g, "\\'")
        const data = await gadsFetch(customerId, 'googleAds:search', tokens, {
            query: `SELECT conversion_action.id, conversion_action.name, conversion_action.resource_name,
                           conversion_action.tag_snippets, conversion_action.status
                    FROM conversion_action
                    WHERE conversion_action.name = '${escName}'
                          AND conversion_action.status = 'ENABLED'`,
        }, loginCustomerId)
        const row = (data.results || data?.[0]?.results)?.[0]
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
    spec: ConversionActionSpec,
    loginCustomerId?: string,
): Promise<CreatedConversionAction> {
    const meta = ACTION_META[spec.actionKey]
    if (!meta) throw new Error(`Unknown actionKey: ${spec.actionKey}`)

    // 1. Try to find existing
    const existing = await findExistingAction(customerId, tokens, spec.name, loginCustomerId)
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
    const createBody = {
        operations: [{
            create: {
                name: spec.name,
                category: meta.category,
                type: meta.type,
                status: 'ENABLED',
                primaryForGoal: meta.primaryForGoal,
                includeInConversionsMetric: true,
                countingType: spec.countingType || meta.countingType,
                clickThroughLookbackWindowDays: meta.clickThroughDays,
                viewThroughLookbackWindowDays: meta.viewThroughDays,
                attributionModelSettings: {
                    attributionModel: 'GOOGLE_ADS_DATA_DRIVEN',
                },
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

    const createRes = await gadsFetch(customerId, 'conversionActions:mutate', tokens, createBody, loginCustomerId)
    const resourceName = (createRes.results || [])[0]?.resourceName
    if (!resourceName) throw new Error(`Create returned no resourceName: ${JSON.stringify(createRes).slice(0, 300)}`)

    // 3. Read back tag_snippets to extract (conversionId, conversionLabel)
    const conversionActionId = resourceName.split('/').pop()
    let idLabel: { conversionId: string; conversionLabel: string } | null = null
    for (let attempt = 0; attempt < 4 && !idLabel; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1500))
        try {
            const data = await gadsFetch(customerId, 'googleAds:search', tokens, {
                query: `SELECT conversion_action.id, conversion_action.tag_snippets
                        FROM conversion_action
                        WHERE conversion_action.id = ${conversionActionId}`,
            }, loginCustomerId)
            const row = (data.results || data?.[0]?.results)?.[0]
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

// ─── Bulk: create the conversion actions implied by a paidProfile + plan ─
export async function setupConversionActionsForInstance(
    instanceId: string,
): Promise<{ created: CreatedConversionAction[]; gtmConfigs: GtmConversionConfig[]; warnings: string[] }> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')

    const rd: any = inst.researchData || {}
    const paidProfile = rd.paidProfile
    if (!paidProfile) throw new Error('paidProfile required')

    const googleAdsConfig: any = inst.googleAdsConfig || {}
    const customerId = googleAdsConfig.customerId
    if (!customerId) throw new Error('Google Ads not connected — link customerId first')

    const tokens = inst.googleTokens as any
    if (!tokens?.refreshToken) throw new Error('Google OAuth tokens missing — re-auth with adwords scope')

    const loginCustomerId = googleAdsConfig.mccSubAccountId ? customerId : (googleAdsConfig.loginCustomerId || undefined)

    // Decide which actions to create from paidProfile + mediaPlan
    const specs: ConversionActionSpec[] = []
    const warnings: string[] = []
    const goal = paidProfile.primaryGoal as string
    const phone = !!paidProfile.trackingStack?.phoneCallsRelevant
    const avgDealValue = Number(paidProfile.avgDealValueIls) || 100

    if (goal === 'leadgen' || goal === 'store_visits' || goal === 'app_installs') {
        specs.push({ actionKey: 'form_submit', name: 'Mazhir — Form Submit', defaultValueIls: avgDealValue })
        if (phone) specs.push({ actionKey: 'phone_call', name: 'Mazhir — Phone Click', defaultValueIls: avgDealValue })
        // Qualified lead — for offline CRM upload, optional but recommended
        specs.push({ actionKey: 'qualified_lead', name: 'Mazhir — Qualified Lead (CRM)', defaultValueIls: avgDealValue * 3 })
    } else if (goal === 'ecommerce') {
        specs.push({ actionKey: 'purchase', name: 'Mazhir — Purchase', defaultValueIls: avgDealValue })
    } else {
        warnings.push(`primaryGoal="${goal}" — no default conversion actions configured for this profile`)
    }

    // Pre-flight: enhanced conversions eligibility (informational only)
    const ec = await checkEnhancedConversionsEligibility(customerId, tokens, loginCustomerId)
    if (!ec.eligible) warnings.push(ec.reason)

    const created: CreatedConversionAction[] = []
    for (const spec of specs) {
        try {
            const c = await ensureConversionAction(customerId, tokens, spec, loginCustomerId)
            created.push(c)
        } catch (err) {
            warnings.push(`${spec.name}: ${(err as Error).message}`)
        }
    }

    const gtmConfigs: GtmConversionConfig[] = created
        .filter(c => c.googleAdsConversionId && c.googleAdsConversionLabel)
        .filter(c => c.actionKey !== 'qualified_lead' && c.actionKey !== 'phone_call_offline')  // these are upload-based, no GTM tag
        .map(c => ({
            actionKey: (c.actionKey === 'form_submit' ? 'generate_lead' : c.actionKey) as GtmConversionConfig['actionKey'],
            googleAdsConversionId: c.googleAdsConversionId,
            googleAdsConversionLabel: c.googleAdsConversionLabel,
            sendValue: true,
            defaultValueIls: avgDealValue,
            defaultCurrency: 'ILS',
        }))

    // Persist
    rd.mazhirConversions = { created, warnings, savedAt: new Date().toISOString() }
    await db.update(instances).set({ researchData: rd as any }).where(eq(instances.id, instanceId))

    return { created, gtmConfigs, warnings }
}

export { GtmConversionConfig }