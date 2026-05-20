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

import { eq, and, ne, desc } from 'drizzle-orm'
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

/**
 * Brand-affinity classification for a detected action against the active
 * tenant. Drives the auto-checked state in the picker UI:
 *   - 'this'    → name matches active agent's brand → pre-checked, green
 *   - 'sibling' → name matches ANOTHER agent on same VPS → pre-unchecked,
 *                 red, label "Belongs to: <agent name>"; warns the user
 *                 that their operatingCustomerId may be misconfigured
 *                 (probably MCC root instead of sub-account).
 *   - 'none'    → no brand match → unchecked, neutral; user decides
 */
export type BrandAffinity = 'this' | 'sibling' | 'none'

export interface DetectionCandidate {
    // Raw Ads data
    adsId: string                             // numeric ConversionAction id
    adsResourceName: string                   // customers/{cid}/conversionActions/{id}
    name: string
    category: string
    type: string
    primaryForGoal: boolean
    includeInConversionsMetric: boolean
    googleAdsConversionId?: string
    googleAdsConversionLabel?: string

    // Our matcher's verdict
    suggestedActionKey: PrimaryActionKey | null
    confidence: 'high' | 'medium' | 'low' | 'none'
    matchReason: string

    // Brand affinity vs active tenant
    brandAffinity: BrandAffinity
    siblingAgentSlug?: string                 // when affinity='sibling'
    siblingAgentName?: string

    // What the UI should pre-check
    defaultChecked: boolean
}

export interface DetectionResult {
    customerId: string
    operatingCustomerId?: string
    activeBrandSlug?: string                  // the tenant we're detecting FOR
    activeBrandName?: string
    siblingBrandSlugs: string[]               // other agents on same VPS
    totalFound: number
    enabledCount: number
    skipped: AdsConversionActionRaw[]         // REMOVED/HIDDEN/UNKNOWN
    candidates: DetectionCandidate[]          // EVERY enabled action (unfiltered)
    crossTenantLeakSuspected: boolean         // true when ≥1 sibling-match
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

// ── Brand affinity helper ─────────────────────────────────────────────────
/**
 * Tokenize a brand_slug or name into discriminating words (≥4 chars, no
 * generic stopwords). 'packing-station' → ['packing','station'];
 * 'storage-station' → ['storage','station']. Common token 'station' is OK
 * here because we compare the SET — if action name contains 'station' AND
 * 'packing' we score for packing; if it contains 'station' AND 'storage'
 * we score for storage. The shared token alone is ambiguous.
 */
function tokenizeBrand(s: string): string[] {
    if (!s) return []
    const STOP = new Set(['the','and','of','for','with','site','web','www','com','co','il','ltd','inc','app','llc'])
    return Array.from(new Set(
        s.toLowerCase()
            .split(/[\s\W_]+/)
            .filter(t => t.length >= 4 && !STOP.has(t)),
    ))
}

/**
 * Classify an action's brand affinity vs the active tenant + its VPS siblings.
 *
 *   - 'this'    → name contains ≥1 active-brand discriminating token AND
 *                 (no sibling token OR all sibling tokens are also active's)
 *   - 'sibling' → name contains ≥1 sibling's discriminating token that's
 *                 NOT shared with active's tokens. Returns the matched
 *                 sibling so the UI can label it.
 *   - 'none'    → no brand tokens matched
 */
function classifyBrandAffinity(
    actionName: string,
    activeTokens: string[],
    siblings: Array<{ slug: string; name: string; tokens: string[] }>,
): { affinity: BrandAffinity; siblingSlug?: string; siblingName?: string } {
    const hay = actionName.toLowerCase()
    const activeSet = new Set(activeTokens)

    // Sibling tokens that DON'T overlap with active's are 'unique' identifiers.
    let siblingHit: { slug: string; name: string } | null = null
    for (const sib of siblings) {
        const uniqueSibTokens = sib.tokens.filter(t => !activeSet.has(t))
        for (const t of uniqueSibTokens) {
            if (hay.includes(t)) { siblingHit = { slug: sib.slug, name: sib.name }; break }
        }
        if (siblingHit) break
    }

    // Active brand match: any of its discriminating tokens (whether shared with
    // siblings or not). If active matches but a sibling ALSO matches, sibling
    // wins (the unique-token rule excludes shared tokens already, so a sibling
    // hit means a really sibling-specific keyword was found).
    const activeHit = activeTokens.some(t => hay.includes(t))

    if (siblingHit) return { affinity: 'sibling', siblingSlug: siblingHit.slug, siblingName: siblingHit.name }
    if (activeHit) return { affinity: 'this' }
    return { affinity: 'none' }
}

// ── Run detection: pull live actions + classify them ─────────────────────
/**
 * Reads google_ads_config + googleTokens for the active agent, pulls every
 * ENABLED ConversionAction from the operating account, runs each through
 * matchAdsActionToKey() + classifyBrandAffinity(), and returns the full
 * candidate list. Does NOT filter to best-per-key — the picker UI shows
 * everything and lets the user decide.
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

    // 4) Build brand-context: active agent's tokens + tokens of every OTHER
    //    mateh_agent on the same VPS. Used to mark "Moving Station purchase
    //    action" as 'sibling' when active is Packing.
    const activeSlug = agent?.brandSlug || ''
    const activeName = agent?.name || ''
    const activeTokens = Array.from(new Set([
        ...tokenizeBrand(activeSlug),
        ...tokenizeBrand(activeName),
    ]))

    let siblings: Array<{ slug: string; name: string; tokens: string[] }> = []
    if (agent) {
        const sibRows = await db.select({
            id: matehAgents.id,
            slug: matehAgents.brandSlug,
            name: matehAgents.name,
        })
            .from(matehAgents)
            .where(and(
                eq(matehAgents.vpsInstanceId, instanceId),
                ne(matehAgents.id, agent.id),
            ))
        siblings = sibRows.map(s => ({
            slug: s.slug,
            name: s.name,
            tokens: Array.from(new Set([...tokenizeBrand(s.slug), ...tokenizeBrand(s.name)])),
        }))
    }

    // 5) Build a candidate per ENABLED action — match + classify + decide
    //    defaultChecked.
    const candidates: DetectionCandidate[] = []
    let crossTenantLeakSuspected = false
    for (const a of enabled) {
        const m = matchAdsActionToKey(a)
        const aff = classifyBrandAffinity(a.name, activeTokens, siblings)
        if (aff.affinity === 'sibling') crossTenantLeakSuspected = true

        // Defaults:
        //  - sibling: NEVER pre-check (cross-tenant leak protection)
        //  - this + has actionKey: pre-check
        //  - this + no actionKey: pre-check anyway, UI gets a yellow "pick key"
        //  - none: don't pre-check; user decides
        const defaultChecked = aff.affinity === 'this' && !!m

        candidates.push({
            adsId: a.id,
            adsResourceName: a.resourceName,
            name: a.name,
            category: a.category,
            type: a.type,
            primaryForGoal: a.primaryForGoal,
            includeInConversionsMetric: a.includeInConversionsMetric,
            googleAdsConversionId: a.googleAdsConversionId,
            googleAdsConversionLabel: a.googleAdsConversionLabel,
            suggestedActionKey: m?.actionKey || null,
            confidence: m?.confidence || 'none',
            matchReason: m?.reason || '',
            brandAffinity: aff.affinity,
            siblingAgentSlug: aff.siblingSlug,
            siblingAgentName: aff.siblingName,
            defaultChecked,
        })
    }

    return {
        customerId: String(config.customerId),
        operatingCustomerId,
        activeBrandSlug: activeSlug || undefined,
        activeBrandName: activeName || undefined,
        siblingBrandSlugs: siblings.map(s => s.slug),
        totalFound: actions.length,
        enabledCount: enabled.length,
        skipped,
        candidates,
        crossTenantLeakSuspected,
        fetchedAt: new Date().toISOString(),
    }
}

// ── Draft persistence: write detection into research_data + approval task ─
/**
 * Persists a detection result into research_data.mazhirConversions as a
 * DRAFT mapping AND creates a `pending_review` agent_output as a
 * notification. The actual mapping selection happens in the rich GTM-card
 * picker (frontend) — the user picks WHICH candidates count, then calls
 * /apply-selected. The agent_output is mainly a queue indicator.
 *
 * No filtering happens here: every enabled action is stored in candidates[]
 * so the UI can let the user override sibling-leak default-unchecks and
 * change suggested actionKeys.
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

    // Build the draft block. We keep the FULL DetectionResult so the
    // picker can render brandAffinity, defaultChecked, suggestedActionKey,
    // and the cross-tenant-leak warning.
    const draft = {
        source: 'detected' as const,
        detectedAt: result.fetchedAt,
        customerId: result.customerId,
        operatingCustomerId: result.operatingCustomerId,
        activeBrandSlug: result.activeBrandSlug,
        activeBrandName: result.activeBrandName,
        siblingBrandSlugs: result.siblingBrandSlugs,
        enabledCount: result.enabledCount,
        crossTenantLeakSuspected: result.crossTenantLeakSuspected,
        candidates: result.candidates,
        // Pre-applied count: candidates that the system pre-checked. This
        // is what bulk-Approve would apply (sibling actions stay unchecked).
        defaultCheckedCount: result.candidates.filter(c => c.defaultChecked).length,
    }

    await mutateResearchData(agent, instanceId, (rd: any) => {
        rd.mazhirConversions = { ...(rd.mazhirConversions || {}), draftMapping: draft }
        return rd
    })

    // Create approval task. Title + content are summaries — the rich picker
    // is inside the GTM card; the task itself is mainly a notification.
    const approvalTaskId = nanoid(12)
    const thisCount = result.candidates.filter(c => c.brandAffinity === 'this').length
    const siblingCount = result.candidates.filter(c => c.brandAffinity === 'sibling').length
    const otherCount = result.candidates.filter(c => c.brandAffinity === 'none').length
    const summaryParts: string[] = [
        `מצאנו ${result.enabledCount} פעולות המרה פעילות ב-Google Ads.`,
        `${thisCount} תואמות לעסק הזה (${result.activeBrandName || 'הסוכן'}) ומסומנות כברירת מחדל.`,
    ]
    if (siblingCount > 0) {
        summaryParts.push(`⚠ ${siblingCount} פעולות נראות שייכות לעסק אחר ב-MCC — לא יסומנו אוטומטית.`)
    }
    if (otherCount > 0) {
        summaryParts.push(`${otherCount} פעולות ללא זיהוי ברור של עסק — בידיכם להחליט.`)
    }
    summaryParts.push('פתחו את כרטיס GTM באינטגרציות לבחירה גרגרנית.')
    const bulletLines = result.candidates
        .map(c => {
            const checkbox = c.defaultChecked ? '[x]' : '[ ]'
            const tag = c.brandAffinity === 'this' ? '✓ עסק זה'
                : c.brandAffinity === 'sibling' ? `⚠ ${c.siblingAgentName || 'עסק אחר'}`
                : '◯ לא ידוע'
            const key = c.suggestedActionKey || '(no key)'
            return `- ${checkbox} **${key}** ← "${c.name}" (${c.category || 'ללא קטגוריה'}) · ${tag}`
        })
        .join('\n')
    await db.insert(agentOutputs).values({
        id: approvalTaskId,
        instanceId,
        agentId: agent?.id || null,
        agentRole: 'mazhir',
        outputType: 'conversion_mapping_proposal',
        status: 'pending_review',
        title: `אישור מיפוי פעולות המרה (${thisCount}/${result.enabledCount})`,
        content: summaryParts.join(' ') + '\n\n' + bulletLines,
        metadata: { draft, kind: 'conversion_mapping_proposal' } as never,
        createdAt: new Date(),
    } as never).onConflictDoNothing()

    return { approvalTaskId }
}

// ── Apply: convert candidates → active[] ─────────────────────────────────
/**
 * Generic apply helper. Takes a set of (adsId → actionKey) selections and
 * promotes the matching candidates from draftMapping.candidates[] into
 * mazhirConversions.active[]. Skips entries without (conversionId, label).
 *
 * Used both by applyApprovedConversionMapping (bulk-approve → uses
 * defaultChecked subset) and applySelectedMapping (UI picker → uses the
 * explicit user selection).
 */
async function promoteCandidatesToActive(
    instanceId: string,
    agentId: string | null,
    selections: Map<string, PrimaryActionKey>,
): Promise<{ activated: number; skippedNoSnippet: number }> {
    const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } = await import('./agentContext')
    const agent = agentId
        ? await resolveAgentById(instanceId, agentId)
        : await resolvePrimaryAgent(instanceId)
    let activated = 0
    let skippedNoSnippet = 0
    await mutateResearchData(agent, instanceId, (rd: any) => {
        const draft = rd.mazhirConversions?.draftMapping
        if (!draft) return rd
        const cands: DetectionCandidate[] = draft.candidates || []
        const active: any[] = []
        for (const c of cands) {
            const chosenKey = selections.get(c.adsId)
            if (!chosenKey) continue
            if (!c.googleAdsConversionId || !c.googleAdsConversionLabel) {
                skippedNoSnippet++
                continue
            }
            active.push({
                actionKey: chosenKey,
                name: c.name,
                resourceName: c.adsResourceName,
                googleAdsConversionId: c.googleAdsConversionId,
                googleAdsConversionLabel: c.googleAdsConversionLabel,
                status: 'reused',
                enhancedConversionsEligible: false,
                source: 'mapped',
                brandAffinity: c.brandAffinity,
                approvedAt: new Date().toISOString(),
            })
        }
        activated = active.length
        rd.mazhirConversions = {
            ...(rd.mazhirConversions || {}),
            active,
            draftMapping: { ...draft, appliedAt: new Date().toISOString() },
        }
        return rd
    })
    return { activated, skippedNoSnippet }
}

/**
 * Bulk-Approve path: takes ONLY the candidates that the detector
 * pre-checked (defaultChecked=true), which excludes sibling-brand matches
 * by construction. So even if a user clicks "Approve all" without opening
 * the picker, sibling actions stay out — critical safety against the
 * Moving-Station-class cross-tenant leak.
 */
export async function applyApprovedConversionMapping(
    instanceId: string,
    agentId: string | null,
): Promise<{ activated: number }> {
    const { resolveAgentById, resolvePrimaryAgent, readResearchData } = await import('./agentContext')
    const agent = agentId
        ? await resolveAgentById(instanceId, agentId)
        : await resolvePrimaryAgent(instanceId)
    const rd = await readResearchData(agent, instanceId)
    const draft = ((rd as any).mazhirConversions?.draftMapping) as
        { candidates?: DetectionCandidate[] } | undefined
    if (!draft?.candidates) return { activated: 0 }
    const selections = new Map<string, PrimaryActionKey>()
    for (const c of draft.candidates) {
        if (c.defaultChecked && c.suggestedActionKey) selections.set(c.adsId, c.suggestedActionKey)
    }
    const { activated } = await promoteCandidatesToActive(instanceId, agentId, selections)
    return { activated }
}

/**
 * Explicit UI selection: user picks exactly which (adsId, actionKey) pairs
 * become active. Used by the rich GTM-card picker. Empty selections list =
 * no mapping applied; the draft stays present so user can come back.
 */
export async function applySelectedMapping(
    instanceId: string,
    agentId: string | null,
    selections: Array<{ adsConversionActionId: string; actionKey: PrimaryActionKey }>,
): Promise<{ activated: number; skippedNoSnippet: number }> {
    const sel = new Map<string, PrimaryActionKey>()
    for (const s of selections) {
        if (s.adsConversionActionId && s.actionKey) sel.set(String(s.adsConversionActionId), s.actionKey)
    }
    return promoteCandidatesToActive(instanceId, agentId, sel)
}

// ── Stale: research_data + agent_outputs imports kept above ──────────────
void instances; void matehAgents; void and; void ne; void desc