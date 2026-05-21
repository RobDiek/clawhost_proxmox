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

async function gtmFetch(path: string, accessToken: string, method = 'GET', body?: unknown): Promise<any> {
    const url = path.startsWith('http') ? path : `${GTM_BASE}${path}`
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
    if (!res.ok) {
        const msg = data?.error?.message || text.slice(0, 400)
        throw new Error(`GTM ${method} ${path} → ${res.status}: ${msg}`)
    }
    return data
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

export interface GtmAutoSetupRequest {
    target: GtmTarget
    measurementId?: string               // GA4 G-...
    conversions: GtmConversionConfig[]
    enhancedConversions: boolean         // wire userProperties (email/phone) on awct tags
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

    // ── Resolve workspace: reuse existing mazhir-auto-* or create new ──
    // GTM Standard has a 3-workspace cap (Default + max 2 named). Past test/
    // failed runs leave behind named workspaces, tripping 429 "Resource
    // exhausted" on POST /workspaces. We can't DELETE them — that requires
    // the tagmanager.delete.containers scope which we don't request. So
    // instead we REUSE the most recent mazhir-auto-* if one exists; the
    // idempotent tag/trigger creation logic below skips anything already
    // configured. Only fall through to creating a fresh workspace when no
    // mazhir-auto-* exists.
    let workspaceId: string
    let wsName: string
    let reused = false
    try {
        const existingWs = await gtmFetch(
            `/accounts/${accountId}/containers/${containerId}/workspaces`,
            accessToken,
        )
        const mazhirWorkspaces = (existingWs.workspace || [])
            .filter((w: any) => typeof w.name === 'string' && w.name.startsWith('mazhir-auto-'))
            .sort((a: any, b: any) => String(b.name).localeCompare(String(a.name)))    // newest first
        if (mazhirWorkspaces.length > 0) {
            const w = mazhirWorkspaces[0]
            workspaceId = String(w.workspaceId)
            wsName = String(w.name)
            reused = true
            result.workspaceId = workspaceId
            result.skipped.push({ type: 'workspace', name: wsName, reason: 'reused existing workspace id=' + workspaceId })
        } else {
            wsName = `mazhir-auto-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
            const wsRes = await gtmFetch(
                `/accounts/${accountId}/containers/${containerId}/workspaces`,
                accessToken,
                'POST',
                { name: wsName, description: 'Mazhir auto-setup of conversion infrastructure' },
            )
            workspaceId = String(wsRes.workspaceId)
            result.workspaceId = workspaceId
            result.created.push({ type: 'workspace', name: wsName, id: workspaceId })
        }
    } catch (err) {
        result.errors.push({ step: reused ? 'list_workspaces' : 'create_workspace', error: (err as Error).message })
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

    // ── 8. Create version + publish ──
    // Phase 4.2.3-F2: skip publish when this run made ZERO changes — every
    // tag/variable/trigger we wanted was already present in the live container
    // (idempotent re-run on a mature tenant). Publishing an empty workspace
    // is wasteful AND risks compilerError when a reused mazhir-auto-* workspace
    // has stale dangling refs from a prior failed run. Mark `published=true`
    // since the container IS in the desired state — just not via a new version.
    if (result.created.length === 0) {
        result.published = true
        result.noopReason = 'live container already has all required tags/variables/triggers — no new version needed'
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

// ─── Persist GTM target choice on instance.researchData.mazhirGtm ─────────
// Phase 4.2.1-N: writes via mutateResearchData so that BOTH instances AND
// mateh_agents tables get updated. Earlier impl wrote only to instances,
// which meant any subsequent patchResearchData() call (e.g. integrations sync,
// google-ads-mode) — which reads from mateh_agents (no mazhirGtm) and writes
// back to BOTH tables — would silently wipe mazhirGtm from instances.
// Same class of bug as the Google Ads DB sync gap.
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

    const res = await gtmFetch(`/accounts/${opts.accountId}/containers`, accessToken, 'POST', body)
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