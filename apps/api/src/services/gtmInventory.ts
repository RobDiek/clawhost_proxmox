/**
 * GTM Existing-Tags Inventory
 *
 * Before mazhir_gtm_setup creates Conversion Linker / GCLID Capture / awct /
 * gaawe tags, we audit what's ALREADY in the workspace so we don't:
 *   - duplicate existing tags (creating fire-twice bugs)
 *   - overwrite something the client's previous agency built
 *   - leave the client thinking we're "missing" tags that are present
 *
 * Surfaces a plain inventory for Mazhir's audit prompt and a
 * "tags-we-would-skip" list for the GTM setup pipeline to honor.
 */

const GTM_BASE = 'https://tagmanager.googleapis.com/tagmanager/v2'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface GoogleTokens {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    scopes?: string[]
}

async function refresh(rt: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || ''
    const csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec) return null
    try {
        const r = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' }),
        })
        const j = await r.json() as { access_token?: string }
        return j.access_token || null
    } catch { return null }
}

async function gtmGet(at: string, path: string): Promise<any> {
    const r = await fetch(`${GTM_BASE}${path}`, {
        headers: { 'Authorization': `Bearer ${at}` },
        signal: AbortSignal.timeout(15000),
    })
    if (!r.ok) {
        const t = await r.text().catch(() => '')
        throw new Error(`GTM ${r.status} on ${path}: ${t.slice(0, 200)}`)
    }
    return r.json()
}

export interface GtmInventory {
    available: boolean
    reason?: string
    accountId?: string
    containerId?: string
    workspaceId?: string
    tags: Array<{ name: string; type: string; firingTriggerIds: string[]; status: 'active' | 'paused' | 'unknown' }>
    triggers: Array<{ name: string; type: string }>
    variables: Array<{ name: string; type: string }>
    coverage: {
        hasConversionLinker: boolean
        hasGoogleAdsConversionTag: boolean
        hasEnhancedConversions: boolean
        hasGa4ConfigTag: boolean
        hasGa4EventTag: boolean
        hasConsentMode: boolean
        hasGclidCapture: boolean
    }
}

export async function pullGtmInventory(
    googleTokens: GoogleTokens | null | undefined,
    accountId?: string,
    containerId?: string,
    workspaceId?: string,
    siteUrl?: string,
): Promise<GtmInventory> {
    if (!googleTokens?.refreshToken) {
        return { available: false, reason: 'GTM not connected', tags: [], triggers: [], variables: [], coverage: emptyCoverage() }
    }
    const { normalizeGoogleScopes } = await import('./googleScopes')
    if (!normalizeGoogleScopes(googleTokens.scopes).tagmanager) {
        return { available: false, reason: 'Missing tagmanager OAuth scope', tags: [], triggers: [], variables: [], coverage: emptyCoverage() }
    }
    const at = (googleTokens.expiresAt && googleTokens.expiresAt > Date.now() && googleTokens.accessToken)
        ? googleTokens.accessToken
        : await refresh(googleTokens.refreshToken)
    if (!at) {
        return { available: false, reason: 'GTM token refresh failed', tags: [], triggers: [], variables: [], coverage: emptyCoverage() }
    }

    try {
        // Brand-root match for account+container — same logic as GA4 property
        // selection. NEVER fall through to [0] because agency OAuth users
        // typically have access to many clients' GTM accounts.
        const brandRoot = siteUrl
            ? siteUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase().replace(/^www\./, '').split('.')[0]
            : ''
        const norm = (s: string) => (s || '').toLowerCase().replace(/[\s_-]/g, '')
        const brandKey = brandRoot.replace(/-/g, '')
        if (!accountId) {
            const accs = await gtmGet(at, `/accounts`)
            const list = accs?.account || []
            if (list.length === 0) return { available: false, reason: 'No GTM accounts accessible', tags: [], triggers: [], variables: [], coverage: emptyCoverage() }
            if (brandKey) {
                const matched = list.find((a: any) => norm(a.name).includes(brandKey))
                if (!matched) {
                    const names = list.map((a: any) => a.name).join(', ')
                    return { available: false, reason: `No GTM account matches brand "${brandRoot}". Accessible: [${names}]. Set explicit accountId in instance config.`, tags: [], triggers: [], variables: [], coverage: emptyCoverage() }
                }
                accountId = matched.accountId
            } else {
                if (list.length === 1) accountId = list[0].accountId
                else return { available: false, reason: `${list.length} GTM accounts accessible but no siteUrl hint to disambiguate. Set explicit accountId.`, tags: [], triggers: [], variables: [], coverage: emptyCoverage() }
            }
        }
        if (!containerId) {
            const conts = await gtmGet(at, `/accounts/${accountId}/containers`)
            const list = conts?.container || []
            if (list.length === 0) return { available: false, reason: 'No GTM containers in account', tags: [], triggers: [], variables: [], coverage: emptyCoverage() }
            if (brandKey && list.length > 1) {
                const matched = list.find((c: any) => norm(c.name).includes(brandKey)
                    || (Array.isArray(c.domainName) && c.domainName.some((d: string) => d.toLowerCase().includes(brandKey))))
                containerId = (matched || list[0]).containerId
            } else {
                containerId = list[0].containerId
            }
        }
        if (!workspaceId) {
            const ws = await gtmGet(at, `/accounts/${accountId}/containers/${containerId}/workspaces`)
            const w = ws?.workspace?.[0]
            if (!w) return { available: false, reason: 'No GTM workspaces', tags: [], triggers: [], variables: [], coverage: emptyCoverage() }
            workspaceId = w.workspaceId
        }

        const path = `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`
        const [tagsRes, trigsRes, varsRes] = await Promise.all([
            gtmGet(at, `${path}/tags`).catch(() => ({ tag: [] })),
            gtmGet(at, `${path}/triggers`).catch(() => ({ trigger: [] })),
            gtmGet(at, `${path}/variables`).catch(() => ({ variable: [] })),
        ])

        const tags = (tagsRes.tag || []).map((t: any) => ({
            name: t.name || '?',
            type: t.type || '?',
            firingTriggerIds: t.firingTriggerId || [],
            status: (t.paused === true ? 'paused' : 'active') as 'active' | 'paused',
        }))
        const triggers = (trigsRes.trigger || []).map((t: any) => ({ name: t.name || '?', type: t.type || '?' }))
        const variables = (varsRes.variable || []).map((v: any) => ({ name: v.name || '?', type: v.type || '?' }))

        const tagTypes = tags.map((t: any) => t.type)
        const tagNames = tags.map((t: any) => (t.name || '').toLowerCase())
        const variableNames = variables.map((v: any) => (v.name || '').toLowerCase())

        const coverage = {
            hasConversionLinker: tagTypes.includes('gclidw') || tagNames.some((n: string) => n.includes('conversion linker')),
            hasGoogleAdsConversionTag: tagTypes.includes('awct') || tagNames.some((n: string) => /google ads.*conv|awct/i.test(n)),
            hasEnhancedConversions: variableNames.some((n: string) => n.includes('enhanced conversion')) || tagNames.some((n: string) => n.includes('enhanced conv')),
            hasGa4ConfigTag: tagTypes.includes('googtag') || tagTypes.includes('gaawc'),
            hasGa4EventTag: tagTypes.includes('gaawe'),
            hasConsentMode: tagNames.some((n: string) => /consent|cmp/i.test(n)),
            hasGclidCapture: variableNames.some((n: string) => /gclid/i.test(n)),
        }

        return {
            available: true,
            accountId, containerId, workspaceId,
            tags, triggers, variables,
            coverage,
        }
    } catch (err) {
        return { available: false, reason: `GTM inventory failed: ${(err as Error).message}`, tags: [], triggers: [], variables: [], coverage: emptyCoverage() }
    }
}

function emptyCoverage() {
    return {
        hasConversionLinker: false,
        hasGoogleAdsConversionTag: false,
        hasEnhancedConversions: false,
        hasGa4ConfigTag: false,
        hasGa4EventTag: false,
        hasConsentMode: false,
        hasGclidCapture: false,
    }
}

export function renderGtmInventoryContext(r: GtmInventory): string {
    if (!r.available) {
        return `═══ GTM EXISTING TAGS INVENTORY ═══\n\n(${r.reason || 'unavailable'})`
    }
    const cov = r.coverage
    const flag = (b: boolean) => b ? 'YES' : 'NO'
    return `═══ GTM EXISTING TAGS INVENTORY (workspace ${r.workspaceId}) ═══

Tags: ${r.tags.length} total · Triggers: ${r.triggers.length} · Variables: ${r.variables.length}

Coverage of essential PPC tracking tags:
  Conversion Linker:           ${flag(cov.hasConversionLinker)}
  Google Ads Conversion Tag:   ${flag(cov.hasGoogleAdsConversionTag)}
  Enhanced Conversions config: ${flag(cov.hasEnhancedConversions)}
  GA4 Config Tag:              ${flag(cov.hasGa4ConfigTag)}
  GA4 Event Tag:               ${flag(cov.hasGa4EventTag)}
  Consent Mode v2:             ${flag(cov.hasConsentMode)}
  GCLID Capture variable:      ${flag(cov.hasGclidCapture)}

USE THIS DATA:
- DO NOT recommend running mazhir_gtm_setup for tags that are already YES.
- If hasConversionLinker = NO → that's the most critical missing tag.
- If hasEnhancedConversions = NO but hasGoogleAdsConversionTag = YES → recommend
  enabling Enhanced Conversions on the existing tag (config flip, not new tag).
- If a previous agency built tags with non-standard names, recommend KEEPING
  them rather than replacing — interrupting fires breaks conversion history.`
}