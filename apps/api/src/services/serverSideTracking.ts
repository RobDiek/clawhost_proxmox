/**
 * Server-Side Tracking auto-provision (systemic, all tenants).
 *
 * Closes the onboarding gap found via Packing Station: client-side
 * dataLayer.purchase misses redirect-gateway orders (~50% on some stores).
 * The ClawFlow Companion plugin (v1.8.0+) can fire purchase server-side via
 * GA4 Measurement Protocol — but it needs a measurement_id + api_secret, which
 * nothing created automatically. This service does it:
 *
 *   1. Create/reuse the GA4 MP secret for the tenant's web data stream.
 *      (Blocked by GA4's one-time "User Data Collection Acknowledgement" — if
 *      so, returns needs_ack so the caller can surface a manual 1-click task.)
 *   2. If the companion plugin is installed, POST the config to
 *      /clawflow/v1/serverside-config so server-side purchase starts firing.
 *   3. Record the tenant's OWN (this-affinity) GA4-import conversion actions
 *      into research_data.mazhirConversions.active so the GTM diagnostic's
 *      conversion-readiness gate recognizes the GA4-import path (no awct needed).
 *
 * Called fire-and-forget from GTM-setup success + the T+24h audit. Idempotent.
 */

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { agentIntegrations } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'

export interface ServerSideResult {
    status: 'configured' | 'secret_created' | 'needs_ack' | 'no_companion' | 'skipped' | 'error'
    reason: string
    measurementId?: string
    recordedConversions?: number
}

async function refresh(rt: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || ''
    const csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec || !rt) return null
    try {
        const r = await fetch(TOKEN_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' }),
        })
        const j = await r.json() as { access_token?: string }
        return j.access_token || null
    } catch { return null }
}

async function gget(at: string, url: string): Promise<any> {
    try { return await (await fetch(url, { headers: { Authorization: `Bearer ${at}` }, signal: AbortSignal.timeout(20000) })).json() }
    catch (e) { return { __err: (e as Error).message } }
}
async function gpost(at: string, url: string, body: any): Promise<any> {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) })
    const j = await r.json().catch(() => ({}))
    return { ok: r.ok, status: r.status, body: j }
}

async function resolveWebStream(at: string, measurementId: string): Promise<{ propertyId: string; streamName: string } | null> {
    const summ = await gget(at, `${ADMIN_API}/accountSummaries?pageSize=200`)
    const props: string[] = []
    for (const a of summ.accountSummaries || []) for (const p of a.propertySummaries || []) if (p.property) props.push(p.property)
    for (const prop of props) {
        const ds = await gget(at, `${ADMIN_API}/${prop}/dataStreams?pageSize=50`)
        for (const s of ds.dataStreams || []) {
            if (s.webStreamData?.measurementId === measurementId) return { propertyId: prop.replace('properties/', ''), streamName: s.name }
        }
    }
    return null
}

/** Returns {secret} or {needsAck:true} (GA4 acknowledgement required). */
async function getOrCreateMpSecret(at: string, streamName: string): Promise<{ secret?: string; needsAck?: boolean; error?: string }> {
    const ex = await gget(at, `${ADMIN_API}/${streamName}/measurementProtocolSecrets`)
    const secs = ex.measurementProtocolSecrets || []
    if (secs.length && secs[0].secretValue) return { secret: secs[0].secretValue }
    const c = await gpost(at, `${ADMIN_API}/${streamName}/measurementProtocolSecrets`, { displayName: 'ClawFlow server-side purchase' })
    if (c.ok && c.body?.secretValue) return { secret: c.body.secretValue }
    const msg = JSON.stringify(c.body || {})
    if (/User Data Collection Acknowledgement/i.test(msg)) return { needsAck: true }
    return { error: msg.slice(0, 200) }
}

async function loadWpCfg(agent: MatehAgentRow): Promise<{ url: string; user: string; appPassword: string } | null> {
    const rows = await db.select().from(agentIntegrations)
        .where(and(eq(agentIntegrations.instanceId, agent.vpsInstanceId), eq(agentIntegrations.integrationType, 'wordpress')))
    const row = rows.find(r => r.agentId === agent.id) || rows[0]
    const cfg = (row?.config || {}) as any
    if (cfg.url && cfg.user && cfg.appPassword) return { url: String(cfg.url).replace(/\/$/, ''), user: cfg.user, appPassword: cfg.appPassword }
    return null
}

export async function ensureServerSideTracking(agent: MatehAgentRow, opts: { source: string }): Promise<ServerSideResult> {
    const rd = (agent.researchData || {}) as any
    const measurementId: string | undefined = rd.mazhirGtm?.target?.measurementId
    if (!measurementId) return { status: 'skipped', reason: 'no_measurement_id' }
    const tokens = (agent.googleTokens || {}) as any
    const refreshToken: string | undefined = tokens.refreshToken || tokens.refresh_token
    if (!refreshToken) return { status: 'skipped', reason: 'no_oauth' }
    const at = await refresh(refreshToken)
    if (!at) return { status: 'error', reason: 'oauth_refresh_failed' }

    const { mutateResearchData } = await import('./agentContext')

    // 1) MP secret (create or reuse)
    let secret: string | undefined = rd.serverSideTracking?.ga4ApiSecret
    if (!secret) {
        const stream = await resolveWebStream(at, measurementId)
        if (!stream) return { status: 'error', reason: 'ga4_stream_unresolved' }
        const r = await getOrCreateMpSecret(at, stream.streamName)
        if (r.needsAck) return { status: 'needs_ack', reason: 'ga4_user_data_acknowledgement_required', measurementId }
        if (!r.secret) return { status: 'error', reason: `mp_secret_failed:${r.error || '?'}` }
        secret = r.secret
        await mutateResearchData(agent, agent.vpsInstanceId, (cur: any) => {
            const c = cur || {}
            c.serverSideTracking = { ...(c.serverSideTracking || {}), ga4MeasurementId: measurementId, ga4ApiSecret: secret, propertyId: stream.propertyId, createdAt: new Date().toISOString() }
            return c
        })
    }

    // 2) Configure the companion plugin (if installed)
    let companionConfigured = false
    const wp = await loadWpCfg(agent)
    if (wp) {
        const auth = 'Basic ' + Buffer.from(`${wp.user}:${wp.appPassword}`).toString('base64')
        try {
            const cap = await (await fetch(`${wp.url}/wp-json/clawflow/v1/capabilities`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20000) })).json() as any
            if (cap?.pluginVersion) {
                if (!cap.serverSideEnabled) {
                    const cfgRes = await fetch(`${wp.url}/wp-json/clawflow/v1/serverside-config`, {
                        method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ measurementId, apiSecret: secret }), signal: AbortSignal.timeout(20000),
                    })
                    companionConfigured = cfgRes.ok
                } else companionConfigured = true
            }
        } catch { /* companion not reachable */ }
    }

    // 3) Record this-affinity GA4-import conversions so the GTM diagnostic gate
    //    recognizes the GA4-import path as "conversions ready" (no awct needed).
    let recorded = 0
    try {
        const { detectExistingConversionActions } = await import('./mazhirConversionsDetect')
        const det: any = await detectExistingConversionActions(agent.vpsInstanceId, agent.id)
        if (!det?.error && Array.isArray(det?.candidates)) {
            const own = det.candidates.filter((c: any) =>
                c.brandAffinity === 'this' && c.primaryForGoal && c.includeInConversionsMetric
                && String(c.type || '').startsWith('GOOGLE_ANALYTICS_4'))
            if (own.length) {
                const active = own.map((c: any) => ({
                    actionKey: c.suggestedActionKey || (String(c.category) === 'PURCHASE' ? 'purchase' : 'form_submit'),
                    source: 'ga4_import',
                    name: c.name,
                    adsId: c.adsId,
                    googleAdsConversionId: c.googleAdsConversionId,
                    googleAdsConversionLabel: c.googleAdsConversionLabel,
                }))
                await mutateResearchData(agent, agent.vpsInstanceId, (cur: any) => {
                    const c = cur || {}
                    const mc = c.mazhirConversions || {}
                    // Only seed if empty — don't clobber a real Mazhir mapping.
                    if (!Array.isArray(mc.active) || mc.active.length === 0) {
                        mc.active = active
                        mc.source = 'ga4_import_detected'
                        c.mazhirConversions = mc
                    }
                    return c
                })
                recorded = active.length
            }
        }
    } catch { /* best-effort */ }

    console.log(`[serverSideTracking] ${agent.id} (src=${opts.source}): secret=ok companionConfigured=${companionConfigured} recordedConv=${recorded}`)
    return { status: companionConfigured ? 'configured' : 'secret_created', reason: 'ok', measurementId, recordedConversions: recorded }
}