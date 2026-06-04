/**
 * Mazhir — Google Tag Manager auto-configuration
 *
 * Uses GTM API v2 to provision a complete conversion-tracking infrastructure
 * inside the user's existing GTM container. Idempotent: if Conversion Linker
 * or named tags already exist, we skip creation and reuse.
 *
 * What gets created (in this order):
 *   1. Fresh workspace (named 'mazhir-auto-<timestamp>')
 *   2. Conversion Linker tag (`gclidw`) — All Pages, MUST exist before Ads tags
 *   3. GCLID Capture HTML tag — persists gclid to localStorage + form fields
 *   4. customEvent triggers — `generate_lead`, `phone_call`, `purchase` (avoiding
 *      broken native formSubmission listener which fails on AJAX/SPA forms)
 *   5. Google Ads conversion tag (`awct`) per primary action — wired to its trigger
 *      with Enhanced Conversions user-data parameters (email/phone)
 *   6. GA4 base tag (`googtag`) if measurement ID provided and not already present
 *   7. GA4 event tags (`gaawe`) — generate_lead, phone_call, purchase as appropriate
 *   8. :create_version → :publish — atomic workspace promotion
 *
 * Cleanup: on failure mid-way, the partially-built workspace stays. Caller
 * should retry the same operation, which will detect duplicates and skip.
 *
 * Refs (current 2026):
 *   https://developers.google.com/tag-platform/tag-manager/api/v2/reference
 *   https://developers.google.com/tag-platform/tag-manager/api/v2/devguide
 */

// Phase 4.2.1-N: research_data writes go via mutateResearchData (in
// agentContext) — direct `instances` table writes were silently clobbered.

const GTM_BASE = 'https://tagmanager.googleapis.com/tagmanager/v2'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// ── OAuth helper (matches pattern in services/googleAds.ts) ──
async function getAccessToken(tokens: { accessToken?: string; refreshToken: string; expiresAt?: number }): Promise<string> {
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
    if (!j.access_token) throw new Error(`GTM token refresh failed: ${j.error_description || j.error || 'unknown'}`)
    return j.access_token
}

// GTM API rate limits: 25 Queries Per Minute Per User. autoSetupGtmContainer
// fires ~20+ writes (create workspace + variables + triggers + tags + version
// + publish), often blowing through 25 QPM and getting 429. Per-write throttle
// + retry-with-backoff is required for autonomous unattended runs.
//
// Strategy:
//   - Throttle: WRITE methods (POST/PUT/PATCH/DELETE) sleep `WRITE_DELAY_MS`
//     before each call to stay under the QPM ceiling. READS (GET) skip the
//     throttle since they don't count toward write-specific subquota.
//   - Retry: on 429 OR 5xx, exponential backoff (3s, 9s, 27s) for up to 3
//     attempts. Respects Retry-After header if present.
const WRITE_DELAY_MS = 2500
const MAX_RETRIES = 3
let lastWriteAt = 0

async function gtmFetch(path: string, accessToken: string, method = 'GET', body?: unknown): Promise<any> {
    const url = path.startsWith('http') ? path : `${GTM_BASE}${path}`
    const isWrite = method !== 'GET'
    if (isWrite) {
        const elapsed = Date.now() - lastWriteAt
        const wait = WRITE_DELAY_MS - elapsed
        if (wait > 0) await new Promise(r => setTimeout(r, wait))
        lastWriteAt = Date.now()
    }

    let attempt = 0
    let lastErr: Error | null = null
    while (attempt <= MAX_RETRIES) {
        const res = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        })
        const text = await res.text()
        let data: any = {}
        try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
        if (res.ok) return data

        const status = res.status
        const msg = data?.error?.message || text.slice(0, 400)

        const isRetryable = status === 429 || (status >= 500 && status < 600)
        if (!isRetryable || attempt === MAX_RETRIES) {
            throw new Error(`GTM ${method} ${path} → ${status}: ${msg}`)
        }

        const retryAfterHdr = res.headers.get('Retry-After')
        const retryAfterSec = retryAfterHdr ? parseInt(retryAfterHdr, 10) : NaN
        const backoffMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? retryAfterSec * 1000
            : Math.min(60_000, 3000 * Math.pow(3, attempt))  // 3s, 9s, 27s
        await new Promise(r => setTimeout(r, backoffMs))
        attempt++
        lastErr = new Error(`GTM ${method} ${path} → ${status}: ${msg}`)
        if (isWrite) lastWriteAt = Date.now()
    }
    throw lastErr || new Error('gtmFetch: unknown retry failure')
}

// Detect whether a site already runs a Consent Management Platform. When it
// does, the CMP owns Google Consent Mode — we must NOT add our own consent
// default/update tags (double-management suppressed measurement on Packing:
// 60% "(not set)"). Best-effort homepage fetch + signature scan.
const CMP_SIGNATURES = /cookiebot|onetrust|cookielaw\.org|complianz|cookie-law-info|cmplz|borlabs|iubenda|cookieyes|termly|usercentrics|didomi|quantcast|cookie-script|osano/i
export async function detectSiteCmp(siteUrl?: string | null): Promise<boolean> {
    if (!siteUrl) return false
    let url = String(siteUrl).trim()
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    try {
        const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (FlowmaticBot)' } })
        if (!res.ok) return false
        const html = (await res.text()).slice(0, 200_000)
        return CMP_SIGNATURES.test(html)
    } catch { return false }
}

// ─── Public types ─────────────────────────────────────────────────────────

export interface GtmTarget {
    accountId: string
    containerId: string
    workspaceId?: string                 // set after we create one
    publicId: string                     // GTM-XXXXXXX (the snippet ID)
    name: string
    usageContext: string[]               // ['web'] | ['server']
    measurementId?: string               // G-XXXXXXXXXX if GA4 tag detected
}

export interface GtmConversionConfig {
    actionKey: 'generate_lead' | 'phone_call' | 'purchase' | 'form_submit' | 'qualified_lead'
    googleAdsConversionId: string        // e.g. "1006772047" (without "AW-")
    googleAdsConversionLabel: string     // e.g. "0L_dCLyI84sBEM--iOAD"
    sendValue: boolean
    defaultValueIls?: number
    defaultCurrency: string              // 'ILS'
}

export interface MetaPixelConfig {
    pixelId: string                      // e.g. "1234567890"
    events: Array<'Purchase' | 'Lead' | 'AddToCart' | 'InitiateCheckout' | 'ViewContent' | 'CompleteRegistration'>
    // Map of GTM customEvent actionKey → Meta event name. Reuses the same
    // customEvent triggers we created for awct/gaawe (one trigger per
    // actionKey). E.g. {'purchase':'Purchase','generate_lead':'Lead'}.
    actionKeyToEventName: Record<string, string>
}

export interface GtmAutoSetupRequest {
    target: GtmTarget
    measurementId?: string               // GA4 G-...
    conversions: GtmConversionConfig[]
    enhancedConversions: boolean         // wire userProperties (email/phone) on awct tags
    metaPixel?: MetaPixelConfig          // Meta Pixel base init + per-event Custom HTML tags
    cmpDetected?: boolean                // site runs a CMP (Cookiebot/OneTrust/…) → it OWNS
                                         // Consent Mode; skip our consent default/update tags
}

export interface GtmAutoSetupResult {
    workspaceId: string
    versionId?: string
    published: boolean
    noopReason?: string  // set when nothing was created and we skipped publishing (idempotent no-op)
    created: { type: string; name: string; id: string }[]
    skipped: { type: string; name: string; reason: string }[]
    errors: { step: string; error: string }[]
}

// ─── Step 1: List accessible accounts/containers/workspaces (enumeration) ─
export async function listGtmTargets(googleTokens: any): Promise<GtmTarget[]> {
    if (!googleTokens?.refreshToken) throw new Error('Google OAuth tokens missing')
    const tokens = { accessToken: googleTokens.accessToken, refreshToken: googleTokens.refreshToken, expiresAt: googleTokens.expiresAt }
    const accessToken = await getAccessToken(tokens)

    const accountsRes = await gtmFetch(`/accounts`, accessToken)
    const accounts: any[] = accountsRes.account || []

    const targets: GtmTarget[] = []
    for (const acc of accounts) {
        const accId = String(acc.accountId)
        try {
            const contRes = await gtmFetch(`/accounts/${accId}/containers`, accessToken)
            for (const ct of (contRes.container || [])) {
                targets.push({
                    accountId: accId,
                    containerId: String(ct.containerId),
                    publicId: ct.publicId || '',
                    name: ct.name || '',
                    usageContext: Array.isArray(ct.usageContext) ? ct.usageContext : ['web'],
                })
            }
        } catch (err) {
            console.warn(`[gtmSetup] cannot list containers for account ${accId}:`, (err as Error).message)
        }
    }
    return targets
}

// ─── Helper: scan existing workspace tags to enable idempotency ───────────
async function scanExistingWorkspace(accessToken: string, accountId: string, containerId: string, workspaceId: string) {
    const [tagsRes, trigsRes, varsRes] = await Promise.all([
        gtmFetch(`/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags`, accessToken).catch(() => ({})),
        gtmFetch(`/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers`, accessToken).catch(() => ({})),
        gtmFetch(`/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables`, accessToken).catch(() => ({})),
    ])
    return {
        tags: (tagsRes.tag || []) as any[],
        triggers: (trigsRes.trigger || []) as any[],
        variables: (varsRes.variable || []) as any[],
    }
}

// ─── Step 2-7: Build the conversion infrastructure in a fresh workspace ───
export async function autoSetupGtmContainer(
    googleTokens: any,
    req: GtmAutoSetupRequest,
): Promise<GtmAutoSetupResult> {
    if (!googleTokens?.refreshToken) throw new Error('Google OAuth tokens missing')
    if (req.target.usageContext.includes('server')) {
        throw new Error('Server-side GTM container — use sgtmgaaw / sgtmgca tags (not implemented yet)')
    }

    const tokens = { accessToken: googleTokens.accessToken, refreshToken: googleTokens.refreshToken, expiresAt: googleTokens.expiresAt }
    const accessToken = await getAccessToken(tokens)
    const { accountId, containerId } = req.target

    const result: GtmAutoSetupResult = {
        workspaceId: '',
        published: false,
        created: [],
        skipped: [],
        errors: [],
    }

    // ── Resolve workspace: ALWAYS use Default Workspace ──
    // Phase 2026.02 Block 6 K7: switch from named mazhir-auto-* workspaces
    // back to Default Workspace.
    //
    // Why: every container has exactly ONE Default Workspace (immutable id
    // in GTM, accessible via name="Default Workspace"). When we wrote tags
    // to a named workspace + published, GTM's auto-cleanup deleted the
    // named workspace after publish — leaving Default Workspace EMPTY in
    // the UI (its base = old version that never had our tags). Users open
    // GTM, see Default Workspace with 0 tags, and assume nothing was done.
    //
    // New approach: use Default Workspace. Before writing, call workspaces/
    // {wsId}:sync to bring its base up to the latest published version
    // (otherwise Default's base may be Version 1 = pre-Mazhir empty state).
    // After sync, scanExistingWorkspace sees all live tags as already-
    // existing → idempotent skip logic prevents duplicates. New tags add
    // as workspace deltas → publish creates next version. Default Workspace
    // ALWAYS contains the live state.
    let workspaceId: string
    try {
        const existingWs = await gtmFetch(
            `/accounts/${accountId}/containers/${containerId}/workspaces`,
            accessToken,
        )
        const allWorkspaces = (existingWs.workspace || []) as Array<{ workspaceId: string; name: string }>
        // Find Default Workspace by name (case-insensitive). GTM auto-creates
        // it for every container — it MUST exist. If not found, that's a
        // hard error.
        const defaultWs = allWorkspaces.find(w => /^default\s+workspace$/i.test(String(w.name || '')))
        if (!defaultWs) {
            result.errors.push({ step: 'find_default_workspace', error: `Default Workspace not found. Container has ${allWorkspaces.length} workspaces: ${allWorkspaces.map(w => w.name).join(', ')}` })
            return result
        }
        workspaceId = String(defaultWs.workspaceId)
        result.workspaceId = workspaceId
        result.skipped.push({ type: 'workspace', name: 'Default Workspace', reason: `using Default Workspace id=${workspaceId}` })

        // Sync Default Workspace to latest published version so its base
        // includes all previously-published Mazhir fixtures. Without sync,
        // Default's base may be an empty Version 1 and our scan won't see
        // the live tags → duplicate creation attempt → 400 conflict.
        try {
            await gtmFetch(`${`/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`}:sync`, accessToken, 'POST', {})
            result.skipped.push({ type: 'workspace', name: 'Default Workspace', reason: 'synced base with latest published version' })
        } catch (syncErr) {
            // Sync can fail if the workspace has no diff vs latest (already current) or
            // for permission reasons. Non-fatal — proceed and let scan detect what's
            // actually in workspace.
            console.warn(`[gtmSetup] Default Workspace sync warning (non-fatal): ${(syncErr as Error).message.slice(0, 200)}`)
        }
    } catch (err) {
        result.errors.push({ step: 'list_workspaces', error: (err as Error).message })
        return result
    }

    const wsBase = `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`

    // Scan existing tags/triggers/variables. Phase 4.2.3-C: detect against
    // ALL existing tags (user's pre-existing + Mazhir's prior runs), not just
    // by Mazhir naming convention. The workspace inherits live container state
    // so user's existing tags are visible here.
    const existing = await scanExistingWorkspace(accessToken, accountId, containerId, workspaceId)
    const findTagByName = (name: string) => existing.tags.find(t => t.name === name)
    const findTrigByName = (name: string) => existing.triggers.find(t => t.name === name)
    const findVarByName = (name: string) => existing.variables.find(v => v.name === name)

    // Phase 4.2.3-C idempotency helpers:
    //   findTagByTypeAndParam — finds ANY tag of given type with a specific param value
    //     (used for: gclidw, html-with-gclid-content, awct-with-conversionId-label, gaawe-by-event)
    //   findTriggerByCustomEventName — finds ANY customEvent trigger matching event name
    const findTagByType = (type: string) => existing.tags.find(t => t.type === type)
    const findAwctByConversionId = (conversionId: string, conversionLabel: string) =>
        existing.tags.find(t => {
            if (t.type !== 'awct') return false
            const params: any[] = t.parameter || []
            const id = params.find((p: any) => p.key === 'conversionId')?.value
            const label = params.find((p: any) => p.key === 'conversionLabel')?.value
            return id === conversionId && label === conversionLabel
        })
    const findGaaweByEventName = (eventName: string) =>
        existing.tags.find(t => {
            if (t.type !== 'gaawe') return false
            const params: any[] = t.parameter || []
            const evt = params.find((p: any) => p.key === 'eventName')?.value
            return evt === eventName
        })
    const findHtmlTagWithGclidLogic = () =>
        existing.tags.find(t => {
            if (t.type !== 'html') return false
            const params: any[] = t.parameter || []
            const html: string = params.find((p: any) => p.key === 'html')?.value || ''
            // Heuristic: HTML tag that handles gclid persistence in localStorage / dataLayer
            return /gclid/i.test(html) && /(localStorage|dataLayer)/i.test(html)
        })
    const findCustomEventTrigByEventName = (eventName: string) =>
        existing.triggers.find(t => {
            if (t.type !== 'customEvent') return false
            const filters: any[] = t.customEventFilter || []
            return filters.some((f: any) => {
                const params: any[] = f.parameter || []
                const arg0 = params.find((p: any) => p.key === 'arg0')?.value
                const arg1 = params.find((p: any) => p.key === 'arg1')?.value
                return arg0 === '{{_event}}' && arg1 === eventName
            })
        })

    const ALL_PAGES_TRIGGER_ID = '2147479553'  // GTM built-in All Pages trigger constant

    // ── 2. Conversion Linker (gclidw) ──
    // Phase 4.2.3-C: detect by TYPE not just name — if user has their own
    // Conversion Linker (any name), reuse rather than create a duplicate.
    const linkerName = 'Mazhir — Conversion Linker'
    const existingLinker = findTagByName(linkerName) || findTagByType('gclidw')
    if (!existingLinker) {
        try {
            const linker = await gtmFetch(`${wsBase}/tags`, accessToken, 'POST', {
                name: linkerName,
                type: 'gclidw',
                parameter: [
                    { type: 'boolean', key: 'enableCrossDomain', value: 'false' },
                    { type: 'boolean', key: 'enableCookieOverrides', value: 'false' },
                    { type: 'boolean', key: 'enableUrlPassthrough', value: 'true' },
                    { type: 'boolean', key: 'acceptIncoming', value: 'true' },
                ],
                firingTriggerId: [ALL_PAGES_TRIGGER_ID],
            })
            result.created.push({ type: 'tag:gclidw', name: linkerName, id: String(linker.tagId) })
        } catch (err) {
            result.errors.push({ step: 'conversion_linker', error: (err as Error).message })
        }
    } else {
        result.skipped.push({
            type: 'tag:gclidw',
            name: existingLinker.name,
            reason: existingLinker.name === linkerName ? 'already exists' : 'user already has Conversion Linker tag (different name) — reusing',
        })
    }

    // ── 3. GCLID Capture HTML tag — All Pages ──
    // Phase 4.2.3-C: detect by HTML content heuristic (any HTML tag handling
    // gclid → localStorage/dataLayer). Skip if user already has equivalent.
    const gclidCaptureName = 'Mazhir — GCLID Capture'
    const existingGclidHtml = findTagByName(gclidCaptureName) || findHtmlTagWithGclidLogic()
    if (!existingGclidHtml) {
        const html = `<script>
(function() {
  try {
    var p = new URLSearchParams(window.location.search);
    var g = p.get('gclid') || p.get('wbraid') || p.get('gbraid');
    if (g) localStorage.setItem('_gcl_aw_capture', JSON.stringify({ v: g, t: Date.now() }));
    else { try { var c = JSON.parse(localStorage.getItem('_gcl_aw_capture')||'null'); if (c && Date.now()-c.t < 90*86400000) g = c.v; } catch(e){} }
    if (g) {
      document.querySelectorAll('input[name="gclid"], input.gclid-field').forEach(function(el){ el.value = g; });
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ gclid_captured: g });
    }
  } catch(e) { console.warn('[mazhir] gclid capture failed', e); }
})();
</script>`
        try {
            const tag = await gtmFetch(`${wsBase}/tags`, accessToken, 'POST', {
                name: gclidCaptureName,
                type: 'html',
                parameter: [{ type: 'template', key: 'html', value: html }],
                firingTriggerId: [ALL_PAGES_TRIGGER_ID],
            })
            result.created.push({ type: 'tag:html', name: gclidCaptureName, id: String(tag.tagId) })
        } catch (err) {
            result.errors.push({ step: 'gclid_capture', error: (err as Error).message })
        }
    } else {
        result.skipped.push({
            type: 'tag:html',
            name: existingGclidHtml.name,
            reason: existingGclidHtml.name === gclidCaptureName ? 'already exists' : 'user already has GCLID-handling HTML tag — reusing',
        })
    }

    // ── 4. Custom event triggers per conversion action ──
    // Phase 4.2.3-C: also detect by trigger's customEventFilter (any name
    // that fires on the same {{_event}}==actionKey filter is a match).
    const triggerIdByAction: Record<string, string> = {}
    for (const conv of req.conversions) {
        const trigName = `Mazhir CE — ${conv.actionKey}`
        const existingTrig = findTrigByName(trigName) || findCustomEventTrigByEventName(conv.actionKey)
        if (existingTrig) {
            triggerIdByAction[conv.actionKey] = String(existingTrig.triggerId)
            result.skipped.push({
                type: 'trigger:customEvent',
                name: existingTrig.name,
                reason: existingTrig.name === trigName ? 'already exists' : 'user already has matching customEvent trigger — reusing',
            })
            continue
        }
        try {
            const trig = await gtmFetch(`${wsBase}/triggers`, accessToken, 'POST', {
                name: trigName,
                type: 'customEvent',
                customEventFilter: [{
                    type: 'equals',
                    parameter: [
                        { type: 'template', key: 'arg0', value: '{{_event}}' },
                        { type: 'template', key: 'arg1', value: conv.actionKey },
                    ],
                }],
            })
            triggerIdByAction[conv.actionKey] = String(trig.triggerId)
            result.created.push({ type: 'trigger:customEvent', name: trigName, id: String(trig.triggerId) })
        } catch (err) {
            result.errors.push({ step: `trigger:${conv.actionKey}`, error: (err as Error).message })
        }
    }

    // ── 4.5. DataLayer Variables referenced by awct + gaawe tags ──
    // Phase 4.2.2-C4 (real bug): the awct/gaawe tags below reference
    // {{DLV - lead_value}}, {{DLV - transaction_id}}, {{DLV - user.email}},
    // {{DLV - user.phone}}. If these variables don't exist, GTM marks the
    // version's `compilerError: true` and refuses to publish (returning a
    // misleading 404 "Not found or permission denied" — the same error
    // shape as a real permission denial, which caused us to chase ghost
    // permission bugs). Create them here defensively before the tags.
    const dlvSpecs = [
        { name: 'DLV - lead_value',     dataLayerKey: 'lead_value',     defaultValue: '0',  needed: req.conversions.some(c => c.sendValue) },
        { name: 'DLV - transaction_id', dataLayerKey: 'transaction_id', defaultValue: '',   needed: req.conversions.some(c => c.sendValue) },
        { name: 'DLV - user.email',     dataLayerKey: 'user.email',     defaultValue: '',   needed: !!req.enhancedConversions },
        { name: 'DLV - user.phone',     dataLayerKey: 'user.phone',     defaultValue: '',   needed: !!req.enhancedConversions },
    ]
    for (const spec of dlvSpecs) {
        if (!spec.needed) continue
        if (findVarByName(spec.name)) {
            result.skipped.push({ type: 'variable:dlv', name: spec.name, reason: 'already exists' })
            continue
        }
        try {
            const varRes = await gtmFetch(`${wsBase}/variables`, accessToken, 'POST', {
                name: spec.name,
                type: 'v',    // DataLayer Variable type code
                parameter: [
                    { type: 'integer',  key: 'dataLayerVersion', value: '2' },
                    { type: 'boolean',  key: 'setDefaultValue',  value: 'true' },
                    { type: 'template', key: 'defaultValue',     value: spec.defaultValue },
                    { type: 'template', key: 'name',             value: spec.dataLayerKey },
                ],
            })
            result.created.push({ type: 'variable:dlv', name: spec.name, id: String(varRes.variableId) })
        } catch (err) {
            result.errors.push({ step: `variable:${spec.name}`, error: (err as Error).message })
        }
    }

    // ── 5. Google Ads conversion tags (awct), one per action ──
    // Phase 4.2.3-C: also detect by (conversionId, conversionLabel) — if user
    // already has an awct tag firing on the same conversion (any name), skip
    // to prevent double-counting that same conversion from this site.
    for (const conv of req.conversions) {
        const tagName = `Mazhir GAds Conv — ${conv.actionKey}`
        const existingAwct = findTagByName(tagName)
            || findAwctByConversionId(conv.googleAdsConversionId, conv.googleAdsConversionLabel)
        if (existingAwct) {
            result.skipped.push({
                type: 'tag:awct',
                name: existingAwct.name,
                reason: existingAwct.name === tagName
                    ? 'already exists'
                    : `user already has awct tag for ${conv.googleAdsConversionId}/${conv.googleAdsConversionLabel} — skipping to avoid double-count`,
            })
            continue
        }
        const trigId = triggerIdByAction[conv.actionKey]
        if (!trigId) {
            result.errors.push({ step: `awct:${conv.actionKey}`, error: 'trigger missing — skipping tag' })
            continue
        }
        const params: any[] = [
            { type: 'template', key: 'conversionId', value: conv.googleAdsConversionId },
            { type: 'template', key: 'conversionLabel', value: conv.googleAdsConversionLabel },
            { type: 'boolean', key: 'enableConversionLinker', value: 'true' },
            { type: 'template', key: 'currencyCode', value: conv.defaultCurrency || 'ILS' },
        ]
        if (conv.sendValue) {
            // Read value from dataLayer; fall back to default if not set
            params.push({ type: 'template', key: 'conversionValue', value: '{{DLV - lead_value}}' })
            // orderId for dedupe — pulled from dataLayer
            params.push({ type: 'template', key: 'orderId', value: '{{DLV - transaction_id}}' })
        }
        if (req.enhancedConversions) {
            params.push({
                type: 'list', key: 'userProperties',
                list: [
                    { type: 'map', map: [
                        { type: 'template', key: 'name', value: 'email_address' },
                        { type: 'template', key: 'value', value: '{{DLV - user.email}}' },
                    ]},
                    { type: 'map', map: [
                        { type: 'template', key: 'name', value: 'phone_number' },
                        { type: 'template', key: 'value', value: '{{DLV - user.phone}}' },
                    ]},
                ],
            })
        }
        try {
            const tag = await gtmFetch(`${wsBase}/tags`, accessToken, 'POST', {
                name: tagName,
                type: 'awct',
                parameter: params,
                firingTriggerId: [trigId],
            })
            result.created.push({ type: 'tag:awct', name: tagName, id: String(tag.tagId) })
        } catch (err) {
            result.errors.push({ step: `awct:${conv.actionKey}`, error: (err as Error).message })
        }
    }

    // ── 6+7. GA4 base tag + event tags (only if measurementId provided) ──
    if (req.measurementId) {
        const baseName = 'Mazhir — GA4 Base (googtag)'
        const hasBase = !!findTagByName(baseName) || existing.tags.some(t => t.type === 'googtag' || t.type === 'gaawc')
        if (!hasBase) {
            try {
                const tag = await gtmFetch(`${wsBase}/tags`, accessToken, 'POST', {
                    name: baseName,
                    type: 'googtag',
                    parameter: [{ type: 'template', key: 'tagId', value: req.measurementId }],
                    firingTriggerId: [ALL_PAGES_TRIGGER_ID],
                })
                result.created.push({ type: 'tag:googtag', name: baseName, id: String(tag.tagId) })
            } catch (err) {
                result.errors.push({ step: 'ga4_base', error: (err as Error).message })
            }
        } else {
            result.skipped.push({ type: 'tag:googtag', name: baseName, reason: 'GA4 base tag already present' })
        }

        // Event tags per conversion action (mirror but for GA4)
        // Phase 4.2.3-C: detect by event name param (gaawe tag firing same
        // event name = duplicate, regardless of tag name).
        for (const conv of req.conversions) {
            const evName = `Mazhir GA4 — ${conv.actionKey}`
            const existingGaawe = findTagByName(evName) || findGaaweByEventName(conv.actionKey)
            if (existingGaawe) {
                result.skipped.push({
                    type: 'tag:gaawe',
                    name: existingGaawe.name,
                    reason: existingGaawe.name === evName ? 'already exists' : `user already has gaawe tag for event "${conv.actionKey}" — skipping`,
                })
                continue
            }
            const trigId = triggerIdByAction[conv.actionKey]
            if (!trigId) continue
            const params: any[] = [
                { type: 'template', key: 'eventName', value: conv.actionKey },
                { type: 'template', key: 'measurementIdOverride', value: req.measurementId },
                { type: 'boolean', key: 'sendEcommerceData', value: 'false' },
            ]
            if (conv.sendValue) {
                params.push({
                    type: 'list', key: 'eventParameters',
                    list: [
                        { type: 'map', map: [
                            { type: 'template', key: 'name', value: 'value' },
                            { type: 'template', key: 'value', value: '{{DLV - lead_value}}' },
                        ]},
                        { type: 'map', map: [
                            { type: 'template', key: 'name', value: 'currency' },
                            { type: 'template', key: 'value', value: conv.defaultCurrency || 'ILS' },
                        ]},
                    ],
                })
            }
            try {
                const tag = await gtmFetch(`${wsBase}/tags`, accessToken, 'POST', {
                    name: evName,
                    type: 'gaawe',
                    parameter: params,
                    firingTriggerId: [trigId],
                })
                result.created.push({ type: 'tag:gaawe', name: evName, id: String(tag.tagId) })
            } catch (err) {
                result.errors.push({ step: `gaawe:${conv.actionKey}`, error: (err as Error).message })
            }
        }
    }

    // ── 7.7. Click-to-contact tracking (WhatsApp + phone) — systemic ──
    // Many IL service businesses convert primarily via WhatsApp/phone-click,
    // not web forms (Packing Station: 0 WhatsApp events in GA4 = invisible).
    // Native GTM has no wa.me/tel: listener, so inject a lightweight delegated
    // click-capture HTML tag (All Pages) that pushes dataLayer events
    // 'whatsapp_click' + 'phone_call'. customEvent triggers + GA4 event tags
    // turn them into GA4 events → marked as key events → imported to Ads as
    // SECONDARY conversions (counted, NOT biddable — bidding stays on purchase).
    const clickCaptureName = 'Mazhir — Click-to-Contact Capture'
    const existingClickCapture = findTagByName(clickCaptureName) ||
        existing.tags.find((t: any) => {
            if (t.type !== 'html') return false
            const html: string = ((t.parameter || []).find((p: any) => p.key === 'html')?.value) || ''
            return /wa\.me|whatsapp/i.test(html) && /addEventListener\(\s*['"]click/i.test(html)
        })
    if (!existingClickCapture) {
        const html = `<script>
(function(){
  if (window.__mazhirClickCapture) return; window.__mazhirClickCapture = true;
  window.dataLayer = window.dataLayer || [];
  document.addEventListener('click', function(e){
    try {
      var a = (e.target && e.target.closest) ? e.target.closest('a') : null;
      if (!a || !a.getAttribute) return;
      var href = (a.getAttribute('href') || '').toLowerCase();
      if (!href) return;
      if (href.indexOf('wa.me') > -1 || href.indexOf('api.whatsapp.com') > -1 || href.indexOf('web.whatsapp.com') > -1 || href.indexOf('whatsapp://') === 0) {
        window.dataLayer.push({ event: 'whatsapp_click', contact_method: 'whatsapp', link_url: a.href });
      } else if (href.indexOf('tel:') === 0) {
        window.dataLayer.push({ event: 'phone_call', contact_method: 'phone', link_url: a.href });
      }
    } catch(err) {}
  }, true);
})();
</script>`
        try {
            const tag = await gtmFetch(`${wsBase}/tags`, accessToken, 'POST', {
                name: clickCaptureName,
                type: 'html',
                parameter: [{ type: 'template', key: 'html', value: html }],
                firingTriggerId: [ALL_PAGES_TRIGGER_ID],
            })
            result.created.push({ type: 'tag:html', name: clickCaptureName, id: String(tag.tagId) })
        } catch (err) {
            result.errors.push({ step: 'click_capture', error: (err as Error).message })
        }
    } else {
        result.skipped.push({ type: 'tag:html', name: existingClickCapture.name, reason: 'click-to-contact capture tag already present' })
    }

    // Triggers + GA4 event tags for whatsapp_click / phone_call (idempotent).
    for (const ev of ['whatsapp_click', 'phone_call']) {
        let trigId = triggerIdByAction[ev]
        if (!trigId) {
            const trigName = `Mazhir CE — ${ev}`
            const existingTrig = findTrigByName(trigName) || findCustomEventTrigByEventName(ev)
            if (existingTrig) {
                trigId = String(existingTrig.triggerId)
                triggerIdByAction[ev] = trigId
                result.skipped.push({ type: 'trigger:customEvent', name: existingTrig.name, reason: 'already exists' })
            } else {
                try {
                    const trig = await gtmFetch(`${wsBase}/triggers`, accessToken, 'POST', {
                        name: trigName,
                        type: 'customEvent',
                        customEventFilter: [{ type: 'equals', parameter: [{ type: 'template', key: 'arg0', value: '{{_event}}' }, { type: 'template', key: 'arg1', value: ev }] }],
                    })
                    trigId = String(trig.triggerId)
                    triggerIdByAction[ev] = trigId
                    result.created.push({ type: 'trigger:customEvent', name: trigName, id: trigId })
                } catch (err) { result.errors.push({ step: `click_trigger:${ev}`, error: (err as Error).message }); continue }
            }
        }
        if (req.measurementId) {
            const evName = `Mazhir GA4 — ${ev}`
            const existingGaawe = findTagByName(evName) || findGaaweByEventName(ev)
            if (existingGaawe) { result.skipped.push({ type: 'tag:gaawe', name: existingGaawe.name, reason: 'already exists' }); continue }
            try {
                const tag = await gtmFetch(`${wsBase}/tags`, accessToken, 'POST', {
                    name: evName,
                    type: 'gaawe',
                    parameter: [
                        { type: 'template', key: 'eventName', value: ev },
                        { type: 'template', key: 'measurementIdOverride', value: req.measurementId },
                        { type: 'boolean', key: 'sendEcommerceData', value: 'false' },
                    ],
                    firingTriggerId: [trigId],
                })
                result.created.push({ type: 'tag:gaawe', name: evName, id: String(tag.tagId) })
            } catch (err) { result.errors.push({ step: `click_gaawe:${ev}`, error: (err as Error).message }) }
        }
    }

    // ── 7.6. Meta Pixel base + per-event tags — Phase 2026.02 Block 6 K6 ──
    //
    // Custom HTML strategy (not the Facebook Pixel community gallery
    // template — that requires manual gallery import). Two parts:
    //
    //   A) "Meta Pixel — Base Init" on All Pages — fbq.init + PageView
    //   B) "Meta Pixel Event — <Event>" on the matching customEvent trigger
    //      (REUSES the same triggers we built for awct/gaawe; one Custom
    //      HTML per Meta event mapped from actionKey via
    //      metaPixel.actionKeyToEventName)
    //
    // Idempotency: detect existing fbq init by HTML content (any HTML tag
    // containing `fbq('init',` with our pixelId) — skip if user already
    // has one. Same for per-event tags (HTML containing `fbq('track', '<event>'`).
    if (req.metaPixel?.pixelId) {
        const px = req.metaPixel
        const baseName = 'Meta Pixel — Base Init (Mazhir)'
        const existingBase = findTagByName(baseName) ||
            existing.tags.find((t: any) => {
                if (t.type !== 'html') return false
                const html: string = ((t.parameter || []).find((p: any) => p.key === 'html')?.value) || ''
                return /fbq\s*\(\s*['"]init['"]/i.test(html) && html.includes(px.pixelId)
            })
        if (!existingBase) {
            const baseHtml = `<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${px.pixelId}');
fbq('track', 'PageView');
</script>`
            try {
                const tag = await gtmFetch(`${wsBase}/tags`, accessToken, 'POST', {
                    name: baseName,
                    type: 'html',
                    parameter: [{ type: 'template', key: 'html', value: baseHtml }],
                    firingTriggerId: [ALL_PAGES_TRIGGER_ID],
                    // Fire ONLY after consent_update (so the pixel respects Consent Mode).
                    // GTM auto-blocks tags via consent settings if user wires CMP.
                })
                result.created.push({ type: 'tag:meta_pixel_base', name: baseName, id: String(tag.tagId) })
            } catch (err) {
                result.errors.push({ step: 'meta_pixel_base', error: (err as Error).message })
            }
        } else {
            result.skipped.push({
                type: 'tag:meta_pixel_base',
                name: existingBase.name,
                reason: existingBase.name === baseName ? 'already exists' : `user already has fbq init tag for pixel ${px.pixelId} — reusing`,
            })
        }

        // B) Per-event Custom HTML tags. One per Meta event in px.events.
        // Triggers: reuse customEvent triggers from triggerIdByAction (built for
        // awct/gaawe per actionKey). Each Meta event tag fires on its mapped
        // actionKey trigger.
        for (const event of px.events) {
            // Find which actionKey maps to this Meta event
            const actionKey = Object.entries(px.actionKeyToEventName).find(([_k, v]) => v === event)?.[0]
            if (!actionKey) {
                result.skipped.push({ type: 'tag:meta_pixel_event', name: event, reason: 'no actionKey mapped to this event' })
                continue
            }
            const trigId = triggerIdByAction[actionKey]
            if (!trigId) {
                // No trigger yet — could happen if this event isn't in req.conversions.
                // Create a customEvent trigger now (lazy), so Meta Pixel works
                // even for events without a matching Google Ads conversion action
                // (e.g. AddToCart, InitiateCheckout — usually no Ads action).
                try {
                    const trig = await gtmFetch(`${wsBase}/triggers`, accessToken, 'POST', {
                        name: `Mazhir CE — ${actionKey}`,
                        type: 'customEvent',
                        customEventFilter: [{
                            type: 'equals',
                            parameter: [
                                { type: 'template', key: 'arg0', value: '{{_event}}' },
                                { type: 'template', key: 'arg1', value: actionKey },
                            ],
                        }],
                    })
                    triggerIdByAction[actionKey] = String(trig.triggerId)
                    result.created.push({ type: 'trigger:customEvent', name: `Mazhir CE — ${actionKey}`, id: String(trig.triggerId) })
                } catch (err) {
                    result.errors.push({ step: `meta_pixel:${event}:trigger`, error: (err as Error).message })
                    continue
                }
            }
            const tagName = `Meta Pixel — ${event} (Mazhir)`
            const existingPxEvent = findTagByName(tagName) ||
                existing.tags.find((t: any) => {
                    if (t.type !== 'html') return false
                    const html: string = ((t.parameter || []).find((p: any) => p.key === 'html')?.value) || ''
                    return new RegExp(`fbq\\s*\\(\\s*['"]track['"]\\s*,\\s*['"]${event}['"]`, 'i').test(html) &&
                        html.includes(px.pixelId)
                })
            if (existingPxEvent) {
                result.skipped.push({
                    type: 'tag:meta_pixel_event',
                    name: existingPxEvent.name,
                    reason: existingPxEvent.name === tagName ? 'already exists' : `user already has fbq track ${event} tag — reusing`,
                })
                continue
            }
            // Build event-specific Custom HTML. Purchase/InitiateCheckout/AddToCart
            // include value+currency from DLV references (matches the dataLayer
            // payload our companion plugin pushes for WooCommerce).
            const includesValue = event === 'Purchase' || event === 'InitiateCheckout' || event === 'AddToCart'
            const params = includesValue
                ? `{value: parseFloat({{DLV - lead_value}}) || 0, currency: 'ILS'${event === 'Purchase' ? `, content_ids: [], num_items: 1` : ''}}`
                : '{}'
            const eventHtml = `<script>
if (typeof fbq === 'function') {
  fbq('track', '${event}', ${params});
}
</script>`
            try {
                const tag = await gtmFetch(`${wsBase}/tags`, accessToken, 'POST', {
                    name: tagName,
                    type: 'html',
                    parameter: [{ type: 'template', key: 'html', value: eventHtml }],
                    firingTriggerId: [triggerIdByAction[actionKey]],
                })
                result.created.push({ type: 'tag:meta_pixel_event', name: tagName, id: String(tag.tagId) })
            } catch (err) {
                result.errors.push({ step: `meta_pixel:${event}`, error: (err as Error).message })
            }
        }
    }

    // ── 7.5. Consent Mode v2 — Phase 2026.02 Block 6 ──
    // Two tags:
    //   A) "Consent Default - Denied" — fires on Consent Initialization
    //      trigger (GTM built-in 'consentInit'). Sets all storage to denied
    //      by default so EU/UK/IL compliance traffic is blocked until user
    //      consents via the CMP.
    //   B) "Consent Update - On Accept" — fires on Custom Event trigger
    //      'consent_update' which the user's CMP banner pushes to dataLayer
    //      after consent. Promotes storage to granted.
    //
    // GTM has a BUILT-IN trigger for Consent Initialization (the only way to
    // fire BEFORE all other tags). Its built-in trigger ID is 2147479573.
    const CONSENT_INIT_TRIGGER_ID = '2147479573'  // GTM built-in Consent Initialization - All Pages

    // A) Consent Default. When the site already runs a CMP (Cookiebot/OneTrust/…)
    // it OWNS Google Consent Mode — adding our own default DOUBLE-MANAGES consent
    // and suppressed measurement on Packing (60% "(not set)"). So: skip ours when
    // a CMP is present. When NOT present, region-scope the deny to EEA+UK only so
    // the IL market (the product's audience) measures by default while EU stays
    // GDPR-safe (granted-by-default-except-EEA — the standard non-EU pattern).
    // ALWAYS install the region-scoped granted-IL default (verified on Packing
    // 2026-06). Do NOT skip when a CMP is present: on Packing the CMP (Consent
    // Magic) did NOT reliably grant, so skipping would have left measurement
    // crippled. The granted-IL default is the floor that guarantees the IL market
    // measures; a CMP, if it does Consent Mode, refines per-user on top.
    const consentDefaultName = 'Consent Default - Region-scoped (Mazhir)'
    const existingConsentDefault = findTagByName(consentDefaultName) ||
        findTagByName('Consent Default - Denied (Mazhir)') ||
        existing.tags.find((t: any) => /consent[\s_]*default|consent[\s_]*deny|gtag.*consent.*default/i.test(String(t.name || '')))
    if (!existingConsentDefault) {
        const consentDefaultHtml = `<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
// Global default: GRANTED (IL market measures by default). EEA+UK: DENIED until
// the user grants via a CMP. region-specific defaults override the global one.
gtag('consent', 'default', {
  ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted',
  analytics_storage: 'granted', functionality_storage: 'granted', security_storage: 'granted'
});
gtag('consent', 'default', {
  ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  analytics_storage: 'denied', functionality_storage: 'granted', security_storage: 'granted',
  wait_for_update: 500,
  region: ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB']
});
</script>`
        try {
            const tag = await gtmFetch(`${wsBase}/tags`, accessToken, 'POST', {
                name: consentDefaultName,
                type: 'html',
                parameter: [{ type: 'template', key: 'html', value: consentDefaultHtml }],
                firingTriggerId: [CONSENT_INIT_TRIGGER_ID],
                // tagFiringOption oncePerEvent ensures it fires per page-load.
                tagFiringOption: 'oncePerEvent',
            })
            result.created.push({ type: 'tag:consent_default', name: consentDefaultName, id: String(tag.tagId) })
        } catch (err) {
            result.errors.push({ step: 'consent_default', error: (err as Error).message })
        }
    } else {
        result.skipped.push({
            type: 'tag:consent_default',
            name: existingConsentDefault.name,
            reason: existingConsentDefault.name === consentDefaultName ? 'already exists' : 'user already has Consent Default tag — reusing',
        })
    }

    // B) Consent Update - On Accept (requires a custom event trigger that the
    //    user's CMP banner pushes — typically 'consent_update' or 'cookie_consent_update').
    //    We create the trigger + tag, then document the integration contract.
    const consentUpdateTrigName = 'Mazhir CE — consent_update'
    let consentUpdateTrigId: string | undefined
    const existingConsentUpdateTrig = findTrigByName(consentUpdateTrigName) ||
        findCustomEventTrigByEventName('consent_update') ||
        findCustomEventTrigByEventName('cookie_consent_accept')
    if (existingConsentUpdateTrig) {
        consentUpdateTrigId = String(existingConsentUpdateTrig.triggerId)
        result.skipped.push({
            type: 'trigger:consent_update',
            name: existingConsentUpdateTrig.name,
            reason: existingConsentUpdateTrig.name === consentUpdateTrigName ? 'already exists' : 'user already has consent_update custom event trigger — reusing',
        })
    } else if (!req.cmpDetected) {
        try {
            const trig = await gtmFetch(`${wsBase}/triggers`, accessToken, 'POST', {
                name: consentUpdateTrigName,
                type: 'customEvent',
                customEventFilter: [{
                    type: 'equals',
                    parameter: [
                        { type: 'template', key: 'arg0', value: '{{_event}}' },
                        { type: 'template', key: 'arg1', value: 'consent_update' },
                    ],
                }],
            })
            consentUpdateTrigId = String(trig.triggerId)
            result.created.push({ type: 'trigger:consent_update', name: consentUpdateTrigName, id: consentUpdateTrigId })
        } catch (err) {
            result.errors.push({ step: 'consent_update_trigger', error: (err as Error).message })
        }
    }

    if (consentUpdateTrigId && !req.cmpDetected) {
        const consentUpdateTagName = 'Consent Update - On Accept (Mazhir)'
        const existingConsentUpdate = findTagByName(consentUpdateTagName) ||
            existing.tags.find((t: any) => /consent[\s_]*update|consent[\s_]*grant|gtag.*consent.*update/i.test(String(t.name || '')))
        if (!existingConsentUpdate) {
            const consentUpdateHtml = `<script>
// Promote consent to granted. Fired by the site's CMP via:
//   window.dataLayer.push({ event: 'consent_update' });
// Override these per-storage if your CMP collects granular consent.
gtag('consent', 'update', {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'granted'
});
</script>`
            try {
                const tag = await gtmFetch(`${wsBase}/tags`, accessToken, 'POST', {
                    name: consentUpdateTagName,
                    type: 'html',
                    parameter: [{ type: 'template', key: 'html', value: consentUpdateHtml }],
                    firingTriggerId: [consentUpdateTrigId],
                })
                result.created.push({ type: 'tag:consent_update', name: consentUpdateTagName, id: String(tag.tagId) })
            } catch (err) {
                result.errors.push({ step: 'consent_update_tag', error: (err as Error).message })
            }
        } else {
            result.skipped.push({
                type: 'tag:consent_update',
                name: existingConsentUpdate.name,
                reason: existingConsentUpdate.name === consentUpdateTagName ? 'already exists' : 'user already has Consent Update tag — reusing',
            })
        }
    }

    // ── 8. Create version + publish ──
    // Phase 4.2.3-F2: skip publish when this run made ZERO changes — every
    // tag/variable/trigger we wanted was already present in the live container
    // (idempotent re-run on a mature tenant). Publishing an empty workspace
    // is wasteful AND risks compilerError when a reused mazhir-auto-* workspace
    // has stale dangling refs from a prior failed run. Mark `published=true`
    // since the container IS in the desired state — just not via a new version.
    if (result.created.length === 0) {
        // Phase 2026.02 Block 6 hotfix: don't naively trust "no new tags →
        // already in desired state". Workspace ≠ live. A previous run may have
        // created tags in the workspace, then failed on create_version (429,
        // compilerError, etc.) — leaving fixtures DANGLING (in workspace, not
        // published). Verify by reading LIVE state: if live has fewer/differing
        // expected fixtures, force a publish to push workspace state live.
        let liveHasAllFixtures = false
        try {
            const liveRes = await gtmFetch(
                `/accounts/${accountId}/containers/${containerId}/versions:live`,
                accessToken,
            ).catch(() => ({} as any))
            const liveTags: any[] = liveRes?.tag || []
            const liveTriggers: any[] = liveRes?.trigger || []
            // Naive coverage check: live has at least as many tags+triggers as workspace
            // AND contains the conversion linker (mandatory baseline fixture).
            const wsTagCount = existing.tags.length
            const wsTrigCount = existing.triggers.length
            const liveHasLinker = liveTags.some((t: any) => t.type === 'gclidw' || /conversion[\s_]*linker/i.test(String(t.name || '')))
            liveHasAllFixtures = liveTags.length >= wsTagCount && liveTriggers.length >= wsTrigCount && liveHasLinker
        } catch {
            liveHasAllFixtures = false
        }

        if (liveHasAllFixtures) {
            result.published = true
            result.noopReason = 'live version verified to contain all workspace fixtures — no new version needed'
        } else {
            // Force publish workspace → live. Drops into the normal create_version+publish path below.
            try {
                const versionRes = await gtmFetch(`${wsBase}:create_version`, accessToken, 'POST', {
                    name: `Mazhir auto v${new Date().toISOString().slice(0, 10)} (force-publish)`,
                    notes: 'Force-publish: workspace had fixtures but live version was missing them (likely 429/compilerError in prior run).',
                })
                const versionId = String(versionRes.containerVersion?.containerVersionId || '')
                const compilerError = versionRes.containerVersion?.compilerError
                if (versionId) {
                    result.versionId = versionId
                    await gtmFetch(`/accounts/${accountId}/containers/${containerId}/versions/${versionId}:publish`, accessToken, 'POST')
                    result.published = true
                    result.noopReason = 'force-published workspace state (live was behind)'
                } else if (compilerError) {
                    result.errors.push({ step: 'force_publish', error: `compilerError: ${JSON.stringify(compilerError).slice(0, 400)}` })
                } else {
                    result.errors.push({ step: 'force_publish', error: 'create_version returned no versionId — workspace may have stale refs' })
                }
            } catch (err) {
                result.errors.push({ step: 'force_publish', error: (err as Error).message })
            }
        }
    } else if (result.errors.length === 0 || result.created.length > 0) {
        try {
            const versionRes = await gtmFetch(`${wsBase}:create_version`, accessToken, 'POST', {
                name: `Mazhir auto v${new Date().toISOString().slice(0, 10)}`,
                notes: 'Auto-generated by Mazhir conversion infrastructure setup',
            })
            const versionId = String(versionRes.containerVersion?.containerVersionId || '')
            // Surface GTM's compilerError text when present — distinguishes
            // real permission/404 issues from workspace-content compile failures
            // (see feedback_gtm_404_ambiguous).
            const compilerError = versionRes.containerVersion?.compilerError
            if (versionId) {
                result.versionId = versionId
                await gtmFetch(`/accounts/${accountId}/containers/${containerId}/versions/${versionId}:publish`, accessToken, 'POST')
                result.published = true
            } else if (compilerError) {
                result.errors.push({ step: 'publish', error: `compilerError: ${JSON.stringify(compilerError).slice(0, 400)}` })
            } else {
                result.errors.push({ step: 'publish', error: 'create_version returned no versionId — possible compilerError (workspace may have stale refs; delete and retry)' })
            }
        } catch (err) {
            result.errors.push({ step: 'publish', error: (err as Error).message })
        }
    } else {
        result.errors.push({ step: 'publish', error: 'skipped due to setup errors' })
    }

    // Persist result + target on the instance for later reference
    return result
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 2026.02 Block 6 K6 — Meta Pixel auto-discovery from Meta Graph API
// ═══════════════════════════════════════════════════════════════════════
//
// Given Meta tokens with adAccountId, list pixels owned by the account
// and select the best match by site domain. Used by gtmFreshStack to
// auto-populate GtmAutoSetupRequest.metaPixel without the user typing
// the pixel ID manually.

export interface MetaPixelDiscoveryResult {
    pixelId?: string
    pixelName?: string
    matched?: 'domain_match' | 'first_active' | 'fallback'
    diagnostic: {
        pixelCount: number
        adAccountId?: string
        error?: string
        pixelsListed: Array<{ id: string; name: string }>
    }
}

export async function findMetaPixelForAccount(
    metaTokens: { accessToken?: string; adAccountId?: string } | null | undefined,
    siteDomain?: string,
): Promise<MetaPixelDiscoveryResult> {
    const diagnostic: MetaPixelDiscoveryResult['diagnostic'] = { pixelCount: 0, pixelsListed: [] }
    if (!metaTokens?.accessToken || !metaTokens?.adAccountId) {
        diagnostic.error = 'Meta tokens missing accessToken or adAccountId'
        return { diagnostic }
    }
    const adAccountId = metaTokens.adAccountId.startsWith('act_') ? metaTokens.adAccountId : `act_${metaTokens.adAccountId}`
    diagnostic.adAccountId = adAccountId

    try {
        const url = `https://graph.facebook.com/v21.0/${adAccountId}/adspixels?fields=id,name,last_fired_time&limit=50&access_token=${metaTokens.accessToken}`
        const res = await fetch(url)
        const data = await res.json() as { data?: Array<{ id: string; name: string; last_fired_time?: string }>; error?: any }
        if (!res.ok || data.error) {
            diagnostic.error = data.error?.message || `HTTP ${res.status}`
            return { diagnostic }
        }
        const pixels = data.data || []
        diagnostic.pixelCount = pixels.length
        diagnostic.pixelsListed = pixels.map(p => ({ id: p.id, name: p.name || '' }))
        if (pixels.length === 0) return { diagnostic }

        // Prefer domain-matched name
        const target = (siteDomain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase()
        if (target) {
            const match = pixels.find(p => (p.name || '').toLowerCase().includes(target.split('.')[0]))
            if (match) {
                return { pixelId: match.id, pixelName: match.name, matched: 'domain_match', diagnostic }
            }
        }
        // Prefer most-recently-fired (active) pixel
        const sorted = pixels.slice().sort((a, b) => String(b.last_fired_time || '').localeCompare(String(a.last_fired_time || '')))
        const first = sorted[0]
        return { pixelId: first.id, pixelName: first.name, matched: first.last_fired_time ? 'first_active' : 'fallback', diagnostic }
    } catch (err) {
        diagnostic.error = (err as Error).message
        return { diagnostic }
    }
}

// Default mapping from our PrimaryActionKey schema → Meta event taxonomy.
// WooCommerce companion plugin pushes 'purchase' / 'begin_checkout' /
// 'add_to_cart' dataLayer events — these map cleanly to fbq event names.
export const DEFAULT_META_EVENT_MAP: Record<string, string> = {
    purchase:       'Purchase',
    generate_lead:  'Lead',
    form_submit:    'Lead',
    qualified_lead: 'Lead',
    phone_call:     'Lead',
    add_to_cart:    'AddToCart',
    begin_checkout: 'InitiateCheckout',
    view_item:      'ViewContent',
}

// Build a MetaPixelConfig from auto-detected pixel ID + active conversions.
// Always includes Purchase + Lead if the corresponding triggers exist (typical
// e-commerce baseline). For WooCommerce sites, also adds AddToCart +
// InitiateCheckout since the companion plugin pushes those dataLayer events.
export function buildMetaPixelConfig(opts: {
    pixelId: string
    activeActionKeys: string[]               // from req.conversions
    wooCommerceActive: boolean
}): MetaPixelConfig {
    const actionKeyToEventName: Record<string, string> = {}
    const events: MetaPixelConfig['events'] = []

    // Always include events for any active conversion action that maps
    for (const ak of opts.activeActionKeys) {
        const event = DEFAULT_META_EVENT_MAP[ak]
        if (event && !events.includes(event as any)) {
            events.push(event as any)
            actionKeyToEventName[ak] = event
        }
    }

    // WooCommerce baseline: ensure AddToCart + InitiateCheckout are present
    // (companion plugin pushes 'add_to_cart' + 'begin_checkout' events
    // regardless of whether the user defined Google Ads conversion actions
    // for them).
    if (opts.wooCommerceActive) {
        if (!events.includes('AddToCart')) {
            events.push('AddToCart')
            actionKeyToEventName['add_to_cart'] = 'AddToCart'
        }
        if (!events.includes('InitiateCheckout')) {
            events.push('InitiateCheckout')
            actionKeyToEventName['begin_checkout'] = 'InitiateCheckout'
        }
        if (!events.includes('Purchase')) {
            events.push('Purchase')
            actionKeyToEventName['purchase'] = 'Purchase'
        }
    }

    return { pixelId: opts.pixelId, events, actionKeyToEventName }
}

// ─── Persist GTM target choice on instance.researchData.mazhirGtm ─────────
// Phase 4.2.1-N: writes via mutateResearchData so that BOTH instances AND
// mateh_agents tables get updated. Earlier impl wrote only to instances,
// which meant any subsequent patchResearchData() call (e.g. integrations sync,
// google-ads-mode) — which reads from mateh_agents (no mazhirGtm) and writes
// back to BOTH tables — would silently wipe mazhirGtm from instances.
// Same class of bug as the Google Ads DB sync gap.
// ════════════════════════════════════════════════════════════════════════
// Phase 2026.02 Block 6 — Post-publish live-state validation
// ════════════════════════════════════════════════════════════════════════
//
// Reads the CURRENT workspace (tags + variables) and verifies each
// expected fixture is present + enabled. Used by monthlyTaskExecutor to
// implement "trust → verify → preserve": after autoSetupGtmContainer
// reports success, we re-read live state via API and confirm. If a
// fixture is missing, surface it explicitly — don't trust the publish
// response alone.

export interface ValidationFixture {
    label: string                // human Hebrew/English description
    present: boolean             // found in workspace?
    foundName?: string           // actual tag/variable name found
    notes?: string               // additional context (e.g. disabled, paused)
}

export interface GtmValidationReport {
    fixtures: ValidationFixture[]
    workspaceId?: string
    tagCount: number
    variableCount: number
}

export async function validateGtmFixtures(
    googleTokens: { accessToken?: string; refreshToken: string; expiresAt?: number },
    target: GtmTarget,
    expect: {
        expectConversionLinker?: boolean
        expectGclidCapture?: boolean
        expectGaawe?: boolean              // GA4 Configuration tag
        expectEnhancedConversions?: boolean // user_data variables
        expectConsentMode?: boolean         // Consent Settings / Consent Initialization tag
        expectAwct?: string[]               // expected awct tag names (per-conversion)
        expectMetaPixel?: { pixelId: string; events: string[] }  // Phase 2026.02 K6 — Meta Pixel base + per-event
    },
): Promise<GtmValidationReport> {
    if (!googleTokens?.refreshToken) throw new Error('Google OAuth tokens missing')
    const accessToken = await getAccessToken({
        accessToken: googleTokens.accessToken,
        refreshToken: googleTokens.refreshToken,
        expiresAt: googleTokens.expiresAt,
    })

    const { accountId, containerId } = target

    // Phase 2026.02 Block 6: read LIVE published version (what's actually
    // running on the user's site) — not any workspace. autoSetupGtmContainer
    // creates a temp workspace, publishes it, then deletes the workspace
    // (or leaves it stale). Workspace state ≠ live state. The live version
    // is the source of truth for "what's currently on production".
    let scan: { tags: any[]; triggers: any[]; variables: any[] } = { tags: [], triggers: [], variables: [] }
    let liveVersionId: string | undefined
    try {
        const liveRes = await gtmFetch(
            `/accounts/${accountId}/containers/${containerId}/versions:live`,
            accessToken,
        )
        liveVersionId = liveRes.containerVersionId || liveRes.versionId
        scan.tags = liveRes.tag || []
        scan.triggers = liveRes.trigger || []
        scan.variables = liveRes.variable || []
    } catch (e) {
        // No live version yet (brand-new container) — fall back to first
        // workspace as best-effort.
        const wsRes = await gtmFetch(`/accounts/${accountId}/containers/${containerId}/workspaces`, accessToken)
        const workspaces = (wsRes.workspace || []) as Array<{ workspaceId: string; name: string }>
        if (workspaces.length === 0) {
            return { fixtures: [{ label: 'workspace exists', present: false, notes: `no live version + no workspace; error: ${(e as Error).message.slice(0, 200)}` }], tagCount: 0, variableCount: 0 }
        }
        scan = await scanExistingWorkspace(accessToken, accountId, containerId, workspaces[0].workspaceId)
    }

    const fixtures: ValidationFixture[] = []
    const tagNames = scan.tags.map(t => String(t.name || ''))
    const tagTypes = scan.tags.map(t => String(t.type || ''))
    const variableNames = scan.variables.map(v => String(v.name || ''))

    const findTagByType = (type: string) => scan.tags.find(t => t.type === type)
    const findTagByName = (re: RegExp) => scan.tags.find(t => re.test(String(t.name || '')))
    const findVarByName = (re: RegExp) => scan.variables.find(v => re.test(String(v.name || '')))

    if (expect.expectConversionLinker) {
        const t = findTagByType('gclidw') || findTagByName(/conversion[\s_]*linker/i)
        fixtures.push({ label: 'Conversion Linker tag', present: !!t, foundName: t?.name, notes: t?.paused ? 'PAUSED' : undefined })
    }
    if (expect.expectGclidCapture) {
        const t = findTagByName(/gclid[\s_]*capture|gclid[\s_]*custom/i)
        fixtures.push({ label: 'GCLID Capture HTML tag', present: !!t, foundName: t?.name })
    }
    if (expect.expectGaawe) {
        // GA4 base config — modern Google Tag (googtag) replaced the legacy
        // GA4 Configuration tag (gaawc) in 2023. Accept either. Also accept
        // by name pattern for hand-rolled or older containers.
        const t = findTagByType('googtag') || findTagByType('gaawc') || findTagByName(/ga4[\s_]*config|ga4[\s_]*base|google[\s_]*tag|googtag|gaawc/i)
        fixtures.push({ label: 'GA4 base tag (googtag / gaawc)', present: !!t, foundName: t?.name })
    }
    if (expect.expectEnhancedConversions) {
        const emailVar = findVarByName(/email|user[_\s]*data[_\s]*email/i)
        const phoneVar = findVarByName(/phone|user[_\s]*data[_\s]*phone/i)
        fixtures.push({
            label: 'Enhanced Conversions variables (email + phone hashed)',
            present: !!emailVar && !!phoneVar,
            foundName: [emailVar?.name, phoneVar?.name].filter(Boolean).join(' + '),
            notes: (!emailVar || !phoneVar) ? `missing: ${!emailVar ? 'email' : ''}${(!emailVar && !phoneVar) ? ', ' : ''}${!phoneVar ? 'phone' : ''}` : undefined,
        })
    }
    if (expect.expectConsentMode) {
        const t = findTagByName(/consent[\s_]*(mode|settings|initialization|init|update)/i)
        fixtures.push({ label: 'Consent Mode tag(s)', present: !!t, foundName: t?.name })
    }
    for (const awctName of (expect.expectAwct || [])) {
        const t = findTagByName(new RegExp(awctName, 'i'))
        fixtures.push({ label: `Google Ads conversion (awct): "${awctName}"`, present: !!t, foundName: t?.name })
    }
    if (expect.expectMetaPixel?.pixelId) {
        const px = expect.expectMetaPixel
        // Meta Pixel base — Custom HTML containing fbq init + our pixelId
        const base = scan.tags.find((t: any) => {
            if (t.type !== 'html') return false
            const html: string = ((t.parameter || []).find((p: any) => p.key === 'html')?.value) || ''
            return /fbq\s*\(\s*['"]init['"]/i.test(html) && html.includes(px.pixelId)
        })
        fixtures.push({ label: `Meta Pixel base (fbq init ${px.pixelId})`, present: !!base, foundName: base?.name })
        for (const event of px.events) {
            const eventTag = scan.tags.find((t: any) => {
                if (t.type !== 'html') return false
                const html: string = ((t.parameter || []).find((p: any) => p.key === 'html')?.value) || ''
                return new RegExp(`fbq\\s*\\(\\s*['"]track['"]\\s*,\\s*['"]${event}['"]`, 'i').test(html)
            })
            fixtures.push({ label: `Meta Pixel event: ${event}`, present: !!eventTag, foundName: eventTag?.name })
        }
    }

    return {
        fixtures,
        workspaceId: liveVersionId ? `version:${liveVersionId}` : '(workspace-fallback)',
        tagCount: tagNames.length,
        variableCount: variableNames.length,
    }
}

export async function saveGtmTarget(instanceId: string, target: GtmTarget, agentId: string | null | undefined): Promise<void> {
    const { resolvePrimaryAgent, resolveAgentById, mutateResearchData } = await import('@/services/agentContext')
    const agent = agentId
        ? await resolveAgentById(instanceId, agentId)
        : await resolvePrimaryAgent(instanceId)
    await mutateResearchData(agent, instanceId, (rd: any) => {
        rd.mazhirGtm = { ...(rd.mazhirGtm || {}), target, savedAt: new Date().toISOString() }
        return rd
    })
}

export async function saveGtmSetupResult(instanceId: string, result: GtmAutoSetupResult, agentId: string | null | undefined): Promise<void> {
    const { resolvePrimaryAgent, resolveAgentById, mutateResearchData } = await import('@/services/agentContext')
    const agent = agentId
        ? await resolveAgentById(instanceId, agentId)
        : await resolvePrimaryAgent(instanceId)
    await mutateResearchData(agent, instanceId, (rd: any) => {
        rd.mazhirGtm = { ...(rd.mazhirGtm || {}), lastSetupResult: result, lastSetupAt: new Date().toISOString() }
        return rd
    })
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 2026.02 Block 6 Pattern I — Create fresh GTM Account + Container
// ═══════════════════════════════════════════════════════════════════════
//
// Used when tenant either:
//   (a) Inherited a container from an agency and wants clean separation
//       (Packing Station case — currently inside agency's GTM Account
//       "תורג'מן י.ר נכסים" alongside 50+ other clients), OR
//   (b) Has no GTM infrastructure yet (greenfield new tenant)
//
// Returns the new account/container info + install snippet to put on
// the site. Caller should then re-run autoSetupGtmContainer to populate
// the empty container with standard fixtures (Conversion Linker, GCLID,
// EC variables, Consent Mode v2 etc.).

export interface CreateGtmAccountInput {
    googleTokens: { accessToken?: string; refreshToken: string; expiresAt?: number }
    name: string             // e.g. "Packing Station" or "Flowmatic — {tenant}"
    shareData?: boolean      // shareData=true allows benchmarking comparisons (default false for privacy)
}
export interface CreateGtmAccountResult {
    accountId: string
    name: string
    path: string             // accounts/{accountId}
}

export async function createGtmAccount(opts: CreateGtmAccountInput): Promise<CreateGtmAccountResult> {
    if (!opts.googleTokens?.refreshToken) throw new Error('Google OAuth tokens missing')
    const accessToken = await getAccessToken(opts.googleTokens)

    const body: Record<string, unknown> = {
        name: opts.name,
        shareData: !!opts.shareData,
    }
    const res = await gtmFetch(`/accounts`, accessToken, 'POST', body)
    const acc: any = res
    if (!acc?.accountId) {
        throw new Error(`GTM account creation failed: ${JSON.stringify(res).slice(0, 300)}`)
    }
    return {
        accountId: String(acc.accountId),
        name: String(acc.name || opts.name),
        path: String(acc.path || `accounts/${acc.accountId}`),
    }
}

export interface FreshGtmStackInput {
    googleTokens: { accessToken?: string; refreshToken: string; expiresAt?: number }
    containerName: string             // for new container creation
    siteDomain?: string               // optional — saved to container.domainName
    // Choose ONE of:
    accountName?: string              // attempt API account creation (likely 404 — Google API limit)
    existingAccountId?: string        // OR use an account user already created in GTM UI
}
export interface FreshGtmStackResult {
    account: CreateGtmAccountResult
    container: CreateGtmContainerResult
    target: GtmTarget                 // for saving to research_data.mazhirGtm.target
}

/**
 * Orchestrator: create new GTM Account + Container in one shot. Returns
 * the GtmTarget shape directly compatible with mazhirGtm.target for
 * autoSetupGtmContainer follow-up.
 *
 * IMPORTANT — Google does NOT expose `tagmanager.accounts.create` via
 * public API (404 Not Found). If `existingAccountId` is provided, we
 * skip the create-account step. Otherwise we attempt it and surface
 * the precise error so the caller can fall back to manual UI flow.
 */
export async function createFreshGtmStack(opts: FreshGtmStackInput): Promise<FreshGtmStackResult> {
    let account: CreateGtmAccountResult
    if (opts.existingAccountId) {
        // Skip create; treat the provided accountId as the host for the new container.
        // Read the account meta back via API to confirm access + name.
        const accessToken = await getAccessToken(opts.googleTokens)
        const res = await gtmFetch(`/accounts/${opts.existingAccountId}`, accessToken)
        if (!res?.accountId) {
            throw new Error(`Existing accountId ${opts.existingAccountId} not accessible — verify the OAuth user has Admin on that GTM account`)
        }
        account = {
            accountId: String(res.accountId),
            name: String(res.name || ''),
            path: String(res.path || `accounts/${res.accountId}`),
        }
    } else if (opts.accountName) {
        try {
            account = await createGtmAccount({
                googleTokens: opts.googleTokens,
                name: opts.accountName,
                shareData: false,
            })
        } catch (err) {
            const msg = (err as Error).message
            const is404 = /404|Not Found/i.test(msg)
            throw new Error(
                is404
                    ? 'Google does not allow GTM account creation via public API. User must create the account manually in GTM UI (tagmanager.google.com → Create Account), then call this endpoint again with existingAccountId.'
                    : msg,
            )
        }
    } else {
        throw new Error('Either accountName or existingAccountId must be provided')
    }

    const container = await createGtmContainer({
        googleTokens: opts.googleTokens,
        accountId: account.accountId,
        name: opts.containerName,
        domainName: opts.siteDomain,
    })
    const target: GtmTarget = {
        accountId: account.accountId,
        containerId: container.containerId,
        publicId: container.publicId,
        name: container.name,
        usageContext: container.usageContext,
    }
    return { account, container, target }
}

// ─── Phase 4.2.1-M: Create a new GTM container under user's account ──────
// Used when user has no container matching their site (very common — most
// users connect Google to OUR app but never thought about GTM before). Saves
// a separate trip to tagmanager.google.com manually creating one, then
// returns the public ID + install snippet so the dashboard can show the
// install instructions in one flow.
export interface CreateGtmContainerInput {
    googleTokens: { accessToken?: string; refreshToken: string; expiresAt?: number }
    accountId: string         // existing GTM account id (user picks)
    name: string              // container display name (e.g. "Storage Station")
    domainName?: string       // optional — saved as container.domainName for reference
}
export interface CreateGtmContainerResult {
    accountId: string
    containerId: string
    publicId: string          // GTM-XXXXXXXX
    name: string
    usageContext: string[]
    installSnippetHead: string // <script>...</script> for <head>
    installSnippetBody: string // <noscript><iframe>...</iframe></noscript> for <body>
}

export async function createGtmContainer(opts: CreateGtmContainerInput): Promise<CreateGtmContainerResult> {
    if (!opts.googleTokens?.refreshToken) throw new Error('Google OAuth tokens missing')
    const accessToken = await getAccessToken(opts.googleTokens)

    const body: Record<string, unknown> = {
        name: opts.name,
        usageContext: ['web'],
    }
    if (opts.domainName) body.domainName = [opts.domainName]

    let res: any
    try {
        res = await gtmFetch(`/accounts/${opts.accountId}/containers`, accessToken, 'POST', body)
    } catch (err) {
        // Phase 2026.02 Block 6 Pattern I: idempotent fallback. GTM API
        // returns 400 'Found entity with duplicate name' when a container
        // with the same name already exists in this account (very common
        // re-run scenario, or when user created a 'temp' container during
        // account creation and now we try to create with same name). Look
        // up the existing container and adopt it.
        const msg = (err as Error).message
        if (/duplicate[\s-]*name|already[\s-]*exists/i.test(msg)) {
            try {
                const listRes = await gtmFetch(`/accounts/${opts.accountId}/containers`, accessToken)
                const existing = (listRes.container || []) as any[]
                const matched = existing.find((c: any) => c.name === opts.name)
                if (matched && matched.containerId && matched.publicId) {
                    return {
                        accountId: opts.accountId,
                        containerId: String(matched.containerId),
                        publicId: String(matched.publicId),
                        name: matched.name,
                        usageContext: Array.isArray(matched.usageContext) ? matched.usageContext : ['web'],
                        installSnippetHead: buildGtmHeadSnippet(String(matched.publicId)),
                        installSnippetBody: buildGtmBodySnippet(String(matched.publicId)),
                    }
                }
                // Match by name failed but containers exist — surface available
                // names to caller so they can rename or pick existing.
                throw new Error(`GTM container '${opts.name}' name collision but no exact match found. Existing containers: ${existing.map((c: any) => `"${c.name}" (${c.publicId})`).join(', ')}`)
            } catch (lookupErr) {
                throw new Error(`GTM container create failed with duplicate name; lookup also failed: ${(lookupErr as Error).message}`)
            }
        }
        throw err
    }

    const ct: any = res
    if (!ct?.containerId || !ct?.publicId) {
        throw new Error(`GTM container creation failed: ${JSON.stringify(res).slice(0, 300)}`)
    }
    return {
        accountId: opts.accountId,
        containerId: String(ct.containerId),
        publicId: String(ct.publicId),
        name: ct.name || opts.name,
        usageContext: Array.isArray(ct.usageContext) ? ct.usageContext : ['web'],
        installSnippetHead: buildGtmHeadSnippet(String(ct.publicId)),
        installSnippetBody: buildGtmBodySnippet(String(ct.publicId)),
    }
}

// Standard GTM container snippet (HTML for paste into site <head> + <body>).
// Reference: https://developers.google.com/tag-platform/tag-manager/web
export function buildGtmHeadSnippet(publicId: string): string {
    return `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${publicId}');</script>
<!-- End Google Tag Manager -->`
}
export function buildGtmBodySnippet(publicId: string): string {
    return `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${publicId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`
}