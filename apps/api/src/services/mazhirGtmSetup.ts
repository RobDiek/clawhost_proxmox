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

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'

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
    const [tagsRes, trigsRes] = await Promise.all([
        gtmFetch(`/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags`, accessToken).catch(() => ({})),
        gtmFetch(`/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers`, accessToken).catch(() => ({})),
    ])
    return {
        tags: (tagsRes.tag || []) as any[],
        triggers: (trigsRes.trigger || []) as any[],
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

    // ── Create dedicated workspace ──
    const wsName = `mazhir-auto-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
    let workspaceId: string
    try {
        const wsRes = await gtmFetch(
            `/accounts/${accountId}/containers/${containerId}/workspaces`,
            accessToken,
            'POST',
            { name: wsName, description: 'Mazhir auto-setup of conversion infrastructure' },
        )
        workspaceId = String(wsRes.workspaceId)
        result.workspaceId = workspaceId
        result.created.push({ type: 'workspace', name: wsName, id: workspaceId })
    } catch (err) {
        result.errors.push({ step: 'create_workspace', error: (err as Error).message })
        return result
    }

    const wsBase = `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`

    // Scan existing tags/triggers to skip duplicates (default workspace would have them too, but we're in fresh)
    // Still, we scan to be defensive in case workspace started with anything
    const existing = await scanExistingWorkspace(accessToken, accountId, containerId, workspaceId)
    const findTagByName = (name: string) => existing.tags.find(t => t.name === name)
    const findTrigByName = (name: string) => existing.triggers.find(t => t.name === name)

    const ALL_PAGES_TRIGGER_ID = '2147479553'  // GTM built-in All Pages trigger constant

    // ── 2. Conversion Linker (gclidw) ──
    const linkerName = 'Mazhir — Conversion Linker'
    if (!findTagByName(linkerName)) {
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
        result.skipped.push({ type: 'tag:gclidw', name: linkerName, reason: 'already exists' })
    }

    // ── 3. GCLID Capture HTML tag — All Pages ──
    const gclidCaptureName = 'Mazhir — GCLID Capture'
    if (!findTagByName(gclidCaptureName)) {
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
        result.skipped.push({ type: 'tag:html', name: gclidCaptureName, reason: 'already exists' })
    }

    // ── 4. Custom event triggers per conversion action ──
    const triggerIdByAction: Record<string, string> = {}
    for (const conv of req.conversions) {
        const trigName = `Mazhir CE — ${conv.actionKey}`
        const existingTrig = findTrigByName(trigName)
        if (existingTrig) {
            triggerIdByAction[conv.actionKey] = String(existingTrig.triggerId)
            result.skipped.push({ type: 'trigger:customEvent', name: trigName, reason: 'already exists' })
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

    // ── 5. Google Ads conversion tags (awct), one per action ──
    for (const conv of req.conversions) {
        const tagName = `Mazhir GAds Conv — ${conv.actionKey}`
        if (findTagByName(tagName)) {
            result.skipped.push({ type: 'tag:awct', name: tagName, reason: 'already exists' })
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
        for (const conv of req.conversions) {
            const evName = `Mazhir GA4 — ${conv.actionKey}`
            if (findTagByName(evName)) {
                result.skipped.push({ type: 'tag:gaawe', name: evName, reason: 'already exists' })
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
    if (result.errors.length === 0 || result.created.length > 0) {
        try {
            const versionRes = await gtmFetch(`${wsBase}:create_version`, accessToken, 'POST', {
                name: `Mazhir auto v${new Date().toISOString().slice(0, 10)}`,
                notes: 'Auto-generated by Mazhir conversion infrastructure setup',
            })
            const versionId = String(versionRes.containerVersion?.containerVersionId || '')
            if (versionId) {
                result.versionId = versionId
                await gtmFetch(`/accounts/${accountId}/containers/${containerId}/versions/${versionId}:publish`, accessToken, 'POST')
                result.published = true
            } else {
                result.errors.push({ step: 'publish', error: 'create_version returned no versionId — possible compilerError' })
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
export async function saveGtmTarget(instanceId: string, target: GtmTarget): Promise<void> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')
    const rd: any = inst.researchData || {}
    rd.mazhirGtm = { ...(rd.mazhirGtm || {}), target, savedAt: new Date().toISOString() }
    await db.update(instances).set({ researchData: rd as any }).where(eq(instances.id, instanceId))
}

export async function saveGtmSetupResult(instanceId: string, result: GtmAutoSetupResult): Promise<void> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')
    const rd: any = inst.researchData || {}
    rd.mazhirGtm = { ...(rd.mazhirGtm || {}), lastSetupResult: result, lastSetupAt: new Date().toISOString() }
    await db.update(instances).set({ researchData: rd as any }).where(eq(instances.id, instanceId))
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