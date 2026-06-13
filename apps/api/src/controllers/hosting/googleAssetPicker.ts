/**
 * Google Asset Picker — GA4 properties + GTM containers selection.
 *
 * Problem: OAuth grants account-level access — user's Google account may
 * include 5+ GA4 properties (from past clients, agencies, side projects)
 * and 10+ GTM containers. Auto-selecting properties[0] silently injects
 * another client's data into the audit. ga4Enrich.ts already flags this:
 *
 *   "CRITICAL: an agency OAuth user often has access to many properties
 *    belonging to OTHER clients (Zing Music, FlowMatic, etc). Picking
 *    properties[0] when no exact match exists silently injects another
 *    client's data into the audit."
 *
 * Solution: after OAuth completes (or any time via UI "configure"), user
 * explicitly picks which property + container belong to this tenant. IDs
 * are saved to agent_integrations.config and downstream API calls use
 * them deterministically.
 *
 * Endpoints (Phase 4.1):
 *   GET  /hosting/instances/:id/integrations/google/ga4/properties
 *   POST /hosting/instances/:id/integrations/google/ga4/select
 *   GET  /hosting/instances/:id/integrations/google/gtm/containers
 *   POST /hosting/instances/:id/integrations/google/gtm/select
 */

import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import {
    getAgentIntegration,
    setAgentIntegration,
} from '@/services/agentIntegrations'
import { resolveActiveAgent } from '@/services/agentContext'

interface GoogleTokensConfig {
    accessToken: string
    refreshToken: string
    expiresAt: number
    scopes: string[]
    email?: string
    connectedAt?: string
    // Phase 4.1 — picker selections
    ga4PropertyId?: string
    ga4PropertyName?: string
    gtmAccountId?: string
    gtmAccountName?: string
    gtmContainerId?: string
    gtmContainerName?: string
    gtmContainerPublicId?: string  // GTM-XXXX format for the snippet
}

interface GA4Property {
    propertyId: string                    // e.g. "123456789"
    displayName: string
    accountName?: string
    websiteUrl?: string
    timeZone?: string
    currencyCode?: string
    industry?: string
}

interface GTMAccount {
    accountId: string
    name: string
    containers: GTMContainer[]
}

interface GTMContainer {
    containerId: string                   // numeric ID
    publicId?: string                     // GTM-XXXXXX
    name: string
    usageContext?: string[]               // ['web', 'androidApp', 'iosApp', ...]
    fingerprint?: string
}

// ── Refresh access token from stored refreshToken ────────────────────────
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID || ''
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!clientId || !clientSecret || !refreshToken) return null
    try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        })
        const j = await res.json() as { access_token?: string }
        return j.access_token || null
    } catch {
        return null
    }
}

// ── Resolve fresh access token from instance's google integration ────────
// Multi-MATEH per VPS: agentId MUST be honored. Without it `getAgentIntegration`
// resolves to the primary agent and returns the wrong row (e.g. Storage's
// connection when the UI is operating on Packing). Same isolation gap that
// `readResearchDataForActive` solves for research_data reads.
async function getFreshAccessToken(instanceId: string, agentId?: string): Promise<{
    token: string | null
    config: GoogleTokensConfig | null
}> {
    // Try agent_integrations first (canonical), then fall back via primary agent
    const integration = await getAgentIntegration(instanceId, 'mt', 'google', agentId)
        || await getAgentIntegration(instanceId, 'oc', 'google', agentId)
    let cfg = (integration?.config as unknown as GoogleTokensConfig) || null

    // Reconcile dual-store desync. The OAuth callback writes BOTH the per-agent
    // integration AND instances.googleTokens — but a later additive OAuth (e.g.
    // "+ analytics" for GA4) can land in instances.googleTokens while the agent
    // row goes stale, so the picker reads ["ads"] and 400s "missing analytics
    // scope" even though the grant exists. If the instance-level token is a
    // STRICT scope-superset of the agent row, it's the fuller/newer grant — use
    // it. Strict-superset (not just "has more") avoids handing a secondary
    // agent the primary's broader token (per-agent isolation stays intact).
    try {
        const { db } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [inst] = await db.select({ gt: instances.googleTokens }).from(instances).where(eq(instances.id, instanceId))
        const instCfg = (inst?.gt as unknown as GoogleTokensConfig) || null
        if (instCfg?.refreshToken) {
            const agentScopes = (cfg?.scopes || []).map(String)
            const instScopes = (instCfg.scopes || []).map(String)
            const instSet = new Set(instScopes)
            const instIsSuperset = agentScopes.every(s => instSet.has(s)) && instScopes.length > agentScopes.length
            if (!cfg || !cfg.refreshToken || instIsSuperset) cfg = instCfg
        }
    } catch { /* best-effort reconciliation */ }

    if (!cfg) return { token: null, config: null }
    if (!cfg.refreshToken) return { token: null, config: cfg }
    // Use existing accessToken if not expired
    if (cfg.accessToken && cfg.expiresAt && cfg.expiresAt > Date.now() + 60_000) {
        return { token: cfg.accessToken, config: cfg }
    }
    const refreshed = await refreshAccessToken(cfg.refreshToken)
    return { token: refreshed, config: cfg }
}

// ── GET /hosting/instances/:id/integrations/google/ga4/properties ────────
// Lists all GA4 properties the user's OAuth grants access to. UI shows
// these as a picker so the user can explicitly choose which property this
// tenant is associated with.
export const listGA4Properties = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) {
            return fail(c, 'Instance not found', 404)
        }
        const __agent = await resolveActiveAgent(c, instanceId)
        const { token, config } = await getFreshAccessToken(instanceId, __agent?.id)
        if (!token) {
            return fail(c, 'Google not connected. Connect first.', 400)
        }
        // Scopes may be URLs ('https://www.googleapis.com/auth/analytics.*')
        // OR aliases ('ga4', 'analytics'). Match both.
        const _ga4ScopesArr = Array.isArray(config?.scopes) ? config!.scopes : []
        const _hasGa4Scope = _ga4ScopesArr.some(s => {
            const str = String(s).toLowerCase()
            return /analytics/i.test(str) || str === 'ga4'
        })
        if (!_hasGa4Scope) {
            return fail(c, 'Missing analytics OAuth scope. Reconnect with GA4 scope.', 400)
        }

        // GA4 Admin API: accountSummaries returns properties grouped by account
        const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            return fail(c, `GA4 Admin API ${res.status}: ${errBody.slice(0, 200)}`, 502)
        }
        const j = await res.json() as {
            accountSummaries?: Array<{
                name?: string                  // accounts/{accountId}
                displayName?: string
                propertySummaries?: Array<{
                    property?: string          // properties/{propertyId}
                    displayName?: string
                    propertyType?: string
                }>
            }>
        }

        const properties: Array<GA4Property & { _suggested?: boolean; _suggestReason?: string }> = []
        for (const acc of j.accountSummaries || []) {
            const accountName = acc.displayName || acc.name?.replace('accounts/', '') || ''
            for (const p of acc.propertySummaries || []) {
                if (!p.property) continue
                const propertyId = p.property.replace('properties/', '')
                properties.push({
                    propertyId,
                    displayName: p.displayName || propertyId,
                    accountName,
                })
            }
        }

        // Phase 4.3-P(C) — auto-suggest by brand domain match. Pull the active
        // agent's brand context, score each property's display name + account
        // name against it. Top hit gets `_suggested:true` so the frontend can
        // pre-select it (saves users from picking the wrong tenant on a
        // multi-client OAuth — exactly the cross-client-data risk this picker
        // was built to prevent).
        try {
            const { readResearchData } = await import('@/services/agentContext')
            const rd = (await readResearchData(__agent, instanceId)) as Record<string, unknown>
            const answers = (rd?.answers as Record<string, unknown>) || {}
            const paidProfile = (rd?.paidProfile as Record<string, unknown>) || {}
            const websiteUrl = String(answers.websiteUrl || paidProfile.websiteUrl || '').trim()
            const brandName = String(answers.businessName || __agent?.name || '').trim()
            // Derive a normalized hostname from the websiteUrl so we can substring-match.
            let hostKey = ''
            if (websiteUrl) {
                try {
                    const u = new URL(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : 'https://' + websiteUrl)
                    hostKey = u.hostname.toLowerCase().replace(/^www\./, '').split('.')[0]
                } catch { /* ignore */ }
            }
            // Brand tokens (≥4 chars to avoid noise like "ltd", "co").
            const brandTokens = brandName.toLowerCase().split(/[\s\W]+/).filter(t => t.length >= 4)
            const allTokens = Array.from(new Set([hostKey, ...brandTokens].filter(Boolean)))

            if (allTokens.length > 0) {
                let best: { prop: typeof properties[number]; score: number; reason: string } | null = null
                for (const prop of properties) {
                    const hay = `${prop.displayName} ${prop.accountName || ''}`.toLowerCase()
                    let score = 0
                    const matched: string[] = []
                    for (const tok of allTokens) {
                        if (hay.includes(tok)) { score += (tok === hostKey ? 3 : 2); matched.push(tok) }
                    }
                    if (score > 0 && (!best || score > best.score)) {
                        best = {
                            prop,
                            score,
                            reason: matched.length === 1
                                ? `שם ה-property מכיל "${matched[0]}"`
                                : `שם ה-property תואם: ${matched.join(', ')}`,
                        }
                    }
                }
                if (best) {
                    best.prop._suggested = true
                    best.prop._suggestReason = best.reason
                }
            }
        } catch { /* suggest is best-effort */ }

        return ok(c, {
            properties,
            currentSelection: {
                ga4PropertyId: config?.ga4PropertyId || null,
                ga4PropertyName: config?.ga4PropertyName || null,
            },
        }, properties.length > 0
            ? `Found ${properties.length} GA4 properties`
            : 'No GA4 properties found in this Google account')
    } catch (err) {
        console.error('listGA4Properties error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ── POST /hosting/instances/:id/integrations/google/ga4/select ───────────
// Body: { propertyId: "123456789", propertyName?: "Site - GA4" }
// Saves the selected GA4 property ID to agent_integrations.config so
// downstream API calls (ga4Enrich, mazhirAudit, etc.) use it deterministically
// instead of best-effort brand-name matching.
export const selectGA4Property = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) {
            return fail(c, 'Instance not found', 404)
        }
        const body = await c.req.json<{ propertyId?: string; propertyName?: string }>()
        if (!body.propertyId || !/^\d+$/.test(body.propertyId)) {
            return fail(c, 'propertyId required (numeric string)', 400)
        }

        // Read existing google integration config (per-agent)
        const __agent = await resolveActiveAgent(c, instanceId)
        const agentType: 'mt' | 'oc' = __agent?.agentType === 'mateh' ? 'mt' : 'oc'
        const integration = await getAgentIntegration(instanceId, agentType, 'google', __agent?.id)
        if (!integration) return fail(c, 'Google integration not found', 404)
        const cfg = (integration.config as unknown as GoogleTokensConfig) || {} as GoogleTokensConfig

        const nextCfg: GoogleTokensConfig = {
            ...cfg,
            ga4PropertyId: body.propertyId,
            ga4PropertyName: body.propertyName?.slice(0, 200) || undefined,
        }
        await setAgentIntegration(instanceId, agentType, 'google', nextCfg as never, 'connected', __agent?.id)

        return ok(c, {
            ga4PropertyId: nextCfg.ga4PropertyId,
            ga4PropertyName: nextCfg.ga4PropertyName,
        }, 'GA4 property saved')
    } catch (err) {
        console.error('selectGA4Property error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ── GET /hosting/instances/:id/integrations/google/gtm/containers ─────────
// Lists all GTM accounts + their containers. UI shows hierarchical picker
// (account → container).
export const listGTMContainers = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) {
            return fail(c, 'Instance not found', 404)
        }
        const __agent = await resolveActiveAgent(c, instanceId)
        const { token, config } = await getFreshAccessToken(instanceId, __agent?.id)
        if (!token) return fail(c, 'Google not connected. Connect first.', 400)
        // Scopes may be stored as either:
        //   - URLs: ['https://www.googleapis.com/auth/tagmanager.edit.containers', ...]
        //   - Aliases: ['ads', 'gtm', 'ga4', ...] (current SCOPE_MAP storage)
        // Match both forms.
        const _scopesArr = Array.isArray(config?.scopes) ? config!.scopes : []
        const _hasGtmScope = _scopesArr.some(s => /tagmanager/i.test(String(s)) || String(s).toLowerCase() === 'gtm')
        if (!_hasGtmScope) {
            return fail(c, 'Missing tagmanager OAuth scope. Reconnect with GTM scope.', 400)
        }

        // GTM API v2: accounts.list → for each account, containers.list
        const accRes = await fetch('https://www.googleapis.com/tagmanager/v2/accounts', {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(15_000),
        })
        if (!accRes.ok) {
            const errBody = await accRes.text().catch(() => '')
            return fail(c, `GTM API accounts ${accRes.status}: ${errBody.slice(0, 200)}`, 502)
        }
        const accJ = await accRes.json() as {
            account?: Array<{ accountId?: string; name?: string }>
        }

        const out: GTMAccount[] = []
        for (const acc of accJ.account || []) {
            if (!acc.accountId) continue
            try {
                const contRes = await fetch(
                    `https://www.googleapis.com/tagmanager/v2/accounts/${acc.accountId}/containers`,
                    {
                        headers: { 'Authorization': `Bearer ${token}` },
                        signal: AbortSignal.timeout(15_000),
                    }
                )
                const contJ = await contRes.json() as {
                    container?: Array<{
                        containerId?: string
                        publicId?: string
                        name?: string
                        usageContext?: string[]
                        fingerprint?: string
                    }>
                }
                out.push({
                    accountId: acc.accountId,
                    name: acc.name || acc.accountId,
                    containers: (contJ.container || []).map(ct => ({
                        containerId: String(ct.containerId || ''),
                        publicId: ct.publicId,
                        name: ct.name || ct.containerId || '',
                        usageContext: ct.usageContext,
                        fingerprint: ct.fingerprint,
                    })).filter(c2 => c2.containerId),
                })
            } catch (e) {
                console.warn(`GTM containers fetch failed for account ${acc.accountId}:`, (e as Error).message)
            }
        }

        return ok(c, {
            accounts: out,
            currentSelection: {
                gtmAccountId: config?.gtmAccountId || null,
                gtmAccountName: config?.gtmAccountName || null,
                gtmContainerId: config?.gtmContainerId || null,
                gtmContainerName: config?.gtmContainerName || null,
                gtmContainerPublicId: config?.gtmContainerPublicId || null,
            },
        }, out.length > 0
            ? `Found ${out.length} GTM accounts`
            : 'No GTM accounts found in this Google account')
    } catch (err) {
        console.error('listGTMContainers error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ── POST /hosting/instances/:id/integrations/google/gtm/select ────────────
// Body: { accountId, containerId, accountName?, containerName?, containerPublicId? }
export const selectGTMContainer = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) {
            return fail(c, 'Instance not found', 404)
        }
        const body = await c.req.json<{
            accountId?: string
            containerId?: string
            accountName?: string
            containerName?: string
            containerPublicId?: string
        }>()
        if (!body.accountId || !body.containerId) {
            return fail(c, 'accountId + containerId required', 400)
        }

        const __agent = await resolveActiveAgent(c, instanceId)
        const agentType: 'mt' | 'oc' = __agent?.agentType === 'mateh' ? 'mt' : 'oc'
        const integration = await getAgentIntegration(instanceId, agentType, 'google', __agent?.id)
        if (!integration) return fail(c, 'Google integration not found', 404)
        const cfg = (integration.config as unknown as GoogleTokensConfig) || {} as GoogleTokensConfig

        const nextCfg: GoogleTokensConfig = {
            ...cfg,
            gtmAccountId: body.accountId,
            gtmAccountName: body.accountName?.slice(0, 200) || undefined,
            gtmContainerId: body.containerId,
            gtmContainerName: body.containerName?.slice(0, 200) || undefined,
            gtmContainerPublicId: body.containerPublicId?.slice(0, 50) || undefined,
        }
        await setAgentIntegration(instanceId, agentType, 'google', nextCfg as never, 'connected', __agent?.id)

        return ok(c, {
            gtmAccountId: nextCfg.gtmAccountId,
            gtmAccountName: nextCfg.gtmAccountName,
            gtmContainerId: nextCfg.gtmContainerId,
            gtmContainerName: nextCfg.gtmContainerName,
            gtmContainerPublicId: nextCfg.gtmContainerPublicId,
        }, 'GTM container saved')
    } catch (err) {
        console.error('selectGTMContainer error:', err)
        return fail(c, (err as Error).message, 500)
    }
}