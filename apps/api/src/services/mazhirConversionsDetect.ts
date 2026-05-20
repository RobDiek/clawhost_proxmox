/**
 * Phase 4.3-P (B) — Detect-and-map existing ConversionActions in Google Ads.
 *
 * Replaces the previous "create-only" mindset: when a tenant connects an Ads
 * account that's already wired with ConversionActions (the common case —
 * agency clients, established businesses), the system should DETECT them and
 * map them onto our internal `actionKey` schema, NOT create duplicates.
 *
 * Flow:
 *   1. Read all live ConversionActions from Google Ads via searchStream
 *   2. Pattern-match name + category onto our 6 PrimaryActionKey values
 *   3. Draft a mapping with confidence scores per action
 *   4. Persist the draft into research_data.mazhirConversions (source='detected')
 *   5. Create a pending_review agent_output so user approves the mapping in
 *      משימות פעילות before it counts as "set up"
 *
 * Policy: this module NEVER calls conversionActions:mutate. Detection is
 * read-only by design — aligns with the "no automatic actions" rule
 * (every external-system write requires user approval).
 */

import { eq, and, desc } from 'drizzle-orm'
import { db } from '@/db'
import { instances, matehAgents, agentOutputs } from '@/db/schema'
import type { PrimaryActionKey } from './mazhirConversions'
import { readGoogleAdsConfig } from './agentContext'
import { nanoid } from 'nanoid'

// v22 = latest stable as of 2026 (v18 returns 404).
const GADS_API = 'https://googleads.googleapis.com/v22'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface GoogleTokens {
    accessToken?: string
    refreshToken: string
    expiresAt?: number
}

// ── Public types ──────────────────────────────────────────────────────────

/**
 * Shape returned by Google Ads searchStream for `conversion_action` rows.
 */
export interface AdsConversionActionRaw {
    id: string                                // numeric
    resourceName: string                      // customers/{cid}/conversionActions/{id}
    name: string
    category: string                          // 'LEAD' | 'PURCHASE' | 'SUBMIT_LEAD_FORM' | 'PHONE_CALL_LEAD' | ...
    type: string                              // 'WEBPAGE' | 'UPLOAD_CALLS' | 'UPLOAD_CLICKS' | ...
    status: 'ENABLED' | 'REMOVED' | 'HIDDEN' | 'UNKNOWN' | 'UNSPECIFIED'
    primaryForGoal: boolean
    countingType: string                      // 'ONE_PER_CLICK' | 'MANY_PER_CLICK'
    includeInConversionsMetric: boolean
    googleAdsConversionId?: string            // numeric (from tag_snippets)
    googleAdsConversionLabel?: string         // alphanumeric (from tag_snippets)
}

export interface ConversionActionMappingDraft {
    actionKey: PrimaryActionKey
    confidence: 'high' | 'medium' | 'low'
    reason: string                            // hebrew explanation shown to user
    raw: AdsConversionActionRaw
}

export interface DetectionResult {
    customerId: string
    operatingCustomerId?: string
    totalFound: number
    enabledCount: number
    skipped: AdsConversionActionRaw[]         // REMOVED/HIDDEN/UNKNOWN — not mappable
    mappings: ConversionActionMappingDraft[]  // one per actionKey we found a candidate for
    unmapped: AdsConversionActionRaw[]        // ENABLED actions that didn't match any key
    fetchedAt: string
}

// ── Token refresh ─────────────────────────────────────────────────────────
async function getAccessToken(tokens: GoogleTokens): Promise<string> {
    if (tokens.accessToken && (tokens.expiresAt || 0) > Date.now() + 300_000) {
        return tokens.accessToken
    }
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
    const j = await res.json() as { access_token?: string; error?: string }
    if (!j.access_token) throw new Error(`Token refresh failed: ${j.error || 'unknown'}`)
    return j.access_token
}

// ── List all ConversionActions on the operating account ──────────────────
/**
 * Pulls every ConversionAction visible to the customer + its tag_snippets so
 * we can also read out the (conversionId, conversionLabel) pair needed to
 * wire GTM tags. Returns raw rows; pattern matching happens in mapActionToKey.
 */
export async function listAdsConversionActions(
    operatingCustomerId: string,
    loginCustomerId: string,
    tokens: GoogleTokens,
    developerToken: string,
): Promise<AdsConversionActionRaw[]> {
    if (!developerToken) throw new Error('Google Ads developer token missing')
    const accessToken = await getAccessToken(tokens)
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': developerToken,
    }
    if (loginCustomerId && loginCustomerId !== operatingCustomerId) {
        headers['login-customer-id'] = loginCustomerId
    }

    // searchStream tolerates client-customer-user OAuth (where :search 403s).
    const url = `${GADS_API}/customers/${operatingCustomerId}/googleAds:searchStream`
    const body = {
        query: `SELECT
                    conversion_action.id,
                    conversion_action.resource_name,
                    conversion_action.name,
                    conversion_action.category,
                    conversion_action.type,
                    conversion_action.status,
                    conversion_action.primary_for_goal,
                    conversion_action.counting_type,
                    conversion_action.include_in_conversions_metric,
                    conversion_action.tag_snippets
                FROM conversion_action
                WHERE conversion_action.status != 'REMOVED'`,
    }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    const text = await res.text()
    let data: any = {}
    try { data = text ? JSON.parse(text) : {} } catch { /* not JSON */ }
    if (!res.ok) {
        const firstErr = data?.error?.details?.[0]?.errors?.[0]
        const msg = firstErr?.message || data?.error?.message || text.slice(0, 300)
        throw new Error(`Google Ads ${res.status}: ${msg}`)
    }

    const chunks = Array.isArray(data) ? data : [data]
    const out: AdsConversionActionRaw[] = []
    for (const chunk of chunks) {
        const rows = chunk?.results || []
        for (const r of rows) {
            const ca = r.conversionAction || r.conversion_action
            if (!ca) continue
            // tag_snippets is an array of { type, page_format, global_site_tag, event_snippet }
            // event_snippet contains "send_to: AW-{conversionId}/{conversionLabel}" — extract.
            let convId: string | undefined
            let convLabel: string | undefined
            const tagSnippets = ca.tagSnippets || ca.tag_snippets || []
            for (const ts of tagSnippets) {
                const snippet = ts.eventSnippet || ts.event_snippet || ''
                const m = /AW-([0-9]+)\/([A-Za-z0-9_-]+)/.exec(snippet)
                if (m) { convId = m[1]; convLabel = m[2]; break }
            }
            out.push({
                id: String(ca.id ?? ''),
                resourceName: ca.resourceName || ca.resource_name || '',
                name: ca.name || '',
                category: ca.category || '',
                type: ca.type || '',
                status: ca.status || 'UNKNOWN',
                primaryForGoal: !!(ca.primaryForGoal ?? ca.primary_for_goal),
                countingType: ca.countingType || ca.counting_type || '',
                includeInConversionsMetric: !!(ca.includeInConversionsMetric ?? ca.include_in_conversions_metric),
                googleAdsConversionId: convId,
                googleAdsConversionLabel: convLabel,
            })
        }
    }
    return out
}

// ── Pattern-match name + category onto our actionKey schema ──────────────
/**
 * Returns the best candidate actionKey for a given Ads conversion action,
 * along with a confidence score and human-readable reason. The matcher
 * prefers category (Google's enum is reliable when set) and falls back to
 * name regex for accounts where users left category=DEFAULT.
 *
 * Important: caller can have MULTIPLE actions match the same actionKey —
 * detection orchestrator picks the best (highest confidence + primaryForGoal
 * + includeInConversionsMetric + most recent activity).
 */
export function matchAdsActionToKey(action: AdsConversionActionRaw): ConversionActionMappingDraft | null {
    const name = action.name.toLowerCase()
    const cat = (action.category || '').toUpperCase()

    // Strong signal: category match. Google enforces these enums; high
    // confidence even if the name is generic.
    if (cat === 'PURCHASE') {
        return { actionKey: 'purchase', confidence: 'high', reason: `קטגוריה PURCHASE זוהתה ע״י Google Ads`, raw: action }
    }
    if (cat === 'PHONE_CALL_LEAD') {
        if (action.type === 'UPLOAD_CALLS') {
            return { actionKey: 'phone_call_offline', confidence: 'high', reason: `PHONE_CALL_LEAD + UPLOAD_CALLS = phone_call_offline (call-tracking provider)`, raw: action }
        }
        return { actionKey: 'phone_call', confidence: 'high', reason: `קטגוריה PHONE_CALL_LEAD זוהתה`, raw: action }
    }
    if (cat === 'SUBMIT_LEAD_FORM') {
        return { actionKey: 'form_submit', confidence: 'high', reason: `קטגוריה SUBMIT_LEAD_FORM זוהתה`, raw: action }
    }
    if (cat === 'QUALIFIED_LEAD') {
        return { actionKey: 'qualified_lead', confidence: 'high', reason: `קטגוריה QUALIFIED_LEAD זוהתה`, raw: action }
    }
    if (cat === 'LEAD' || cat === 'SIGNUP') {
        // Differentiate generate_lead vs form_submit by name hint.
        if (/form|submission|submit|טופס/i.test(name)) {
            return { actionKey: 'form_submit', confidence: 'high', reason: `קטגוריה LEAD + שם מכיל "form/טופס" — form_submit`, raw: action }
        }
        return { actionKey: 'generate_lead', confidence: 'high', reason: `קטגוריה ${cat} זוהתה`, raw: action }
    }

    // Weaker signal: category=DEFAULT or OTHER — match by name pattern.
    // Many older accounts have category=DEFAULT because the UI didn't force
    // a choice when these were created.
    if (/purchase|sale|transaction|רכישה|מכירה|הזמנה/i.test(name)) {
        return { actionKey: 'purchase', confidence: 'medium', reason: `name match: purchase/sale/רכישה`, raw: action }
    }
    if (/phone[ _-]?call|click[ _-]?to[ _-]?call|חיוג|שיחה/i.test(name)) {
        return { actionKey: 'phone_call', confidence: 'medium', reason: `name match: phone-call/חיוג`, raw: action }
    }
    if (/form[ _-]?(submit|submission)|contact[ _-]?form|טופס|השאיר[ה]? פרטים/i.test(name)) {
        return { actionKey: 'form_submit', confidence: 'medium', reason: `name match: form-submit/טופס`, raw: action }
    }
    if (/lead|sign[ _-]?up|register|הרשמה/i.test(name)) {
        return { actionKey: 'generate_lead', confidence: 'medium', reason: `name match: lead/sign-up/הרשמה`, raw: action }
    }

    return null
}

// ── Run detection: pull live actions + map them ──────────────────────────
/**
 * Reads google_ads_config + googleTokens for the active agent, pulls all
 * ConversionActions from the configured operating account, maps them onto
 * our schema, picks one BEST candidate per actionKey, and returns the
 * draft mapping. Does NOT persist anything — caller decides.
 */
export async function detectExistingConversionActions(
    instanceId: string,
    agentId: string | null,
): Promise<DetectionResult | { error: string; reason: string }> {
    // 1) Read per-active-agent ads config (Phase 4.3-P).
    const { resolveAgentById, resolvePrimaryAgent } = await import('./agentContext')
    const agent = agentId
        ? await resolveAgentById(instanceId, agentId)
        : await resolvePrimaryAgent(instanceId)
    const { config } = await readGoogleAdsConfig(agent, instanceId)
    if (!config?.customerId) {
        return { error: 'NOT_CONNECTED', reason: 'Google Ads לא מחובר לסוכן זה' }
    }
    const operatingCustomerId = String(config.scope?.operatingCustomerId || config.customerId || '').replace(/\D/g, '')
    const loginCustomerId = String(config.loginCustomerId || config.customerId || '').replace(/\D/g, '')
    const developerToken = String(config.developerToken || '')
    if (!operatingCustomerId || !developerToken) {
        return { error: 'INCOMPLETE_CONFIG', reason: 'חסר operatingCustomerId או developer token' }
    }

    // 2) Get refresh_token from agent (or instance fallback for legacy).
    const [inst] = await db.select({ gt: instances.googleTokens }).from(instances).where(eq(instances.id, instanceId))
    const tokens = (agent?.googleTokens as { refreshToken?: string; refresh_token?: string } | null)
        || (inst?.gt as { refreshToken?: string; refresh_token?: string } | null)
    const refreshToken = tokens?.refreshToken || tokens?.refresh_token
    if (!refreshToken) {
        return { error: 'NO_REFRESH_TOKEN', reason: 'OAuth refresh_token חסר — חברו Google מחדש עם scope=ads' }
    }

    // 3) Pull live ConversionActions.
    let actions: AdsConversionActionRaw[]
    try {
        actions = await listAdsConversionActions(operatingCustomerId, loginCustomerId, { refreshToken }, developerToken)
    } catch (err) {
        return { error: 'API_ERROR', reason: (err as Error).message }
    }

    const enabled = actions.filter(a => a.status === 'ENABLED')
    const skipped = actions.filter(a => a.status !== 'ENABLED')

    // 4) Match each enabled action.
    const matched: ConversionActionMappingDraft[] = []
    const unmapped: AdsConversionActionRaw[] = []
    for (const a of enabled) {
        const m = matchAdsActionToKey(a)
        if (m) matched.push(m); else unmapped.push(a)
    }

    // 5) Per actionKey, pick the BEST candidate — prefer:
    //    a) primaryForGoal=true
    //    b) higher confidence
    //    c) has googleAdsConversionId+Label (needed for GTM wiring)
    //    d) more recent (we don't have updated_at in the SELECT but we can
    //       sort by includeInConversionsMetric for now)
    const bestPerKey = new Map<PrimaryActionKey, ConversionActionMappingDraft>()
    const confidenceRank: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 }
    for (const m of matched) {
        const existing = bestPerKey.get(m.actionKey)
        if (!existing) { bestPerKey.set(m.actionKey, m); continue }
        const scoreA = (m.raw.primaryForGoal ? 4 : 0)
            + confidenceRank[m.confidence]
            + (m.raw.googleAdsConversionId ? 2 : 0)
            + (m.raw.includeInConversionsMetric ? 1 : 0)
        const scoreB = (existing.raw.primaryForGoal ? 4 : 0)
            + confidenceRank[existing.confidence]
            + (existing.raw.googleAdsConversionId ? 2 : 0)
            + (existing.raw.includeInConversionsMetric ? 1 : 0)
        if (scoreA > scoreB) bestPerKey.set(m.actionKey, m)
    }

    return {
        customerId: String(config.customerId),
        operatingCustomerId,
        totalFound: actions.length,
        enabledCount: enabled.length,
        skipped,
        mappings: Array.from(bestPerKey.values()),
        unmapped,
        fetchedAt: new Date().toISOString(),
    }
}

// ── Draft persistence: write detection into research_data + approval task ─
/**
 * Persists a detection result into research_data.mazhirConversions as a
 * DRAFT mapping (`source='detected'`, all entries marked `pending`) and
 * creates a `pending_review` agent_output so the user can approve the
 * mapping in משימות פעילות.
 *
 * After approval, applyApprovedConversionMapping promotes the draft into
 * `mazhirConversions.active[]` with `source='mapped'` — that's the shape
 * the diagnostic and GTM auto-setup already understand.
 */
export async function persistDetectionAsDraft(
    instanceId: string,
    agentId: string | null,
    result: DetectionResult,
): Promise<{ approvalTaskId: string }> {
    const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } = await import('./agentContext')
    const agent = agentId
        ? await resolveAgentById(instanceId, agentId)
        : await resolvePrimaryAgent(instanceId)

    // Build the draft block.
    const draft = {
        source: 'detected' as const,
        detectedAt: result.fetchedAt,
        customerId: result.customerId,
        operatingCustomerId: result.operatingCustomerId,
        mappings: result.mappings.map(m => ({
            actionKey: m.actionKey,
            confidence: m.confidence,
            reason: m.reason,
            adsConversionActionId: m.raw.id,
            adsResourceName: m.raw.resourceName,
            name: m.raw.name,
            category: m.raw.category,
            type: m.raw.type,
            primaryForGoal: m.raw.primaryForGoal,
            googleAdsConversionId: m.raw.googleAdsConversionId || null,
            googleAdsConversionLabel: m.raw.googleAdsConversionLabel || null,
        })),
        unmapped: result.unmapped.map(a => ({
            id: a.id,
            name: a.name,
            category: a.category,
        })),
        skipped: result.skipped.map(a => ({ id: a.id, name: a.name, status: a.status })),
    }

    await mutateResearchData(agent, instanceId, (rd: any) => {
        rd.mazhirConversions = { ...(rd.mazhirConversions || {}), draftMapping: draft }
        return rd
    })

    // Create approval task in משימות פעילות.
    const approvalTaskId = nanoid(12)
    const summary = `מצאנו ${result.enabledCount} פעולות המרה פעילות ב-Google Ads. מיפינו ${draft.mappings.length} מהן על המבנה הפנימי שלנו.`
        + (result.unmapped.length > 0 ? ` ${result.unmapped.length} פעולות לא זוהו אוטומטית — ניתן להתעלם או למפות ידנית.` : '')
        + ' אישור לא משנה שום דבר ב-Google Ads — רק מסמן את הפעולות הקיימות כמוכנות לשימוש ע״י Mazhir.'
    const bulletLines = draft.mappings
        .map(m => `- **${m.actionKey}** ← "${m.name}" (${m.category || 'ללא קטגוריה'}) · ביטחון ${m.confidence}`)
        .join('\n')
    await db.insert(agentOutputs).values({
        id: approvalTaskId,
        instanceId,
        agentId: agent?.id || null,
        agentRole: 'mazhir',
        outputType: 'conversion_mapping_proposal',
        status: 'pending_review',
        title: `אישור מיפוי פעולות המרה (${draft.mappings.length})`,
        content: `${summary}\n\n${bulletLines}`,
        metadata: { draft, kind: 'conversion_mapping_proposal' } as never,
        createdAt: new Date(),
    } as never).onConflictDoNothing()

    return { approvalTaskId }
}

// ── Approve: promote draft → active mappings ─────────────────────────────
/**
 * Called when the user approves the mapping proposal in משימות פעילות.
 * Promotes draftMapping entries into mazhirConversions.active[] in the
 * shape the diagnostic + GTM auto-setup already understand.
 *
 * Per-agent: writes to the agent that owns the approval task.
 */
export async function applyApprovedConversionMapping(
    instanceId: string,
    agentId: string | null,
): Promise<{ activated: number }> {
    const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } = await import('./agentContext')
    const agent = agentId
        ? await resolveAgentById(instanceId, agentId)
        : await resolvePrimaryAgent(instanceId)
    let activated = 0
    await mutateResearchData(agent, instanceId, (rd: any) => {
        const draft = rd.mazhirConversions?.draftMapping
        if (!draft) return rd
        const active = (draft.mappings || [])
            .filter((m: any) => m.googleAdsConversionId && m.googleAdsConversionLabel)
            .map((m: any) => ({
                actionKey: m.actionKey,
                name: m.name,
                resourceName: m.adsResourceName,
                googleAdsConversionId: m.googleAdsConversionId,
                googleAdsConversionLabel: m.googleAdsConversionLabel,
                status: 'reused',                       // matches shape used by mazhirConversions
                enhancedConversionsEligible: false,     // not measured yet — set by separate eligibility probe
                source: 'mapped',
                approvedAt: new Date().toISOString(),
            }))
        activated = active.length
        rd.mazhirConversions = {
            ...(rd.mazhirConversions || {}),
            active,
            draftMapping: { ...draft, appliedAt: new Date().toISOString() },
        }
        return rd
    })
    return { activated }
}

// ── Stale: research_data + agent_outputs imports kept above ──────────────
void instances; void matehAgents; void and; void desc