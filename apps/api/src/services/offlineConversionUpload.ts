/**
 * Offline Conversion Upload — systemic store→Ads paid-attribution bridge.
 *
 * Diagnosed on Packing Station (2026-06): 53% of WooCommerce orders carry a
 * captured gclid (`_clawflow_gclid`, set by the companion plugin at checkout)
 * that was NEVER sent to Google Ads. So paid-originated orders that complete by
 * phone/WhatsApp/manual link (= store records them as direct) are invisible in
 * Ads → the account shows ~4 conversions when ~16 orders actually came from paid.
 *
 * This service closes that gap, autonomously + systemically (any WooCommerce
 * tenant). Two entry points:
 *
 *   ensureOfflineAction(agent)
 *     Create/reuse a SECONDARY conversion action "<Business> — Store Orders
 *     (offline)" (category PURCHASE, type UPLOAD_CLICKS, primaryForGoal=false →
 *     counted but NOT biddable, so Smart Bidding keeps optimizing on the
 *     primary online purchase action). On first setup it stamps a watermark =
 *     now, so only NEW orders upload (per Sergei: no historical backfill).
 *
 *   uploadNewStoreOrders(agent, { dryRun })
 *     Read WooCommerce orders created after the watermark with a gclid + not yet
 *     uploaded; upload via customers/{cid}:uploadClickConversions keyed on gclid
 *     + orderId (dedup); mark `_clawflow_ads_uploaded` on the order; advance the
 *     watermark. dryRun uses validateOnly (server-side validation, no write).
 *
 * Refs: https://developers.google.com/google-ads/api/rest/reference/rest/v22/customers/uploadClickConversions
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import { loadWpConfig } from '@/services/seoMetaBatch'

const GADS_API = 'https://googleads.googleapis.com/v22'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const LOOKBACK_DAYS = 90   // Ads click→conversion offline-import window for UPLOAD_CLICKS

export interface OfflineUploadResult {
    status: 'ok' | 'no_ads' | 'no_store' | 'no_action' | 'error'
    reason: string
    actionResourceName?: string
    watermark?: string
    scanned?: number
    eligible?: number
    uploaded?: number
    dryRun?: boolean
    errors?: string[]
}

interface AdsCtx { operating: string; manager: string; dev: string; at: string }

async function accessToken(rt: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || '', csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec || !rt) return null
    try {
        const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' }) })
        return ((await r.json()) as any).access_token || null
    } catch { return null }
}

async function ads(ctx: AdsCtx, path: string, body?: unknown, method = 'POST'): Promise<any> {
    const headers: Record<string, string> = { Authorization: `Bearer ${ctx.at}`, 'Content-Type': 'application/json', 'developer-token': ctx.dev }
    if (ctx.manager && ctx.manager !== ctx.operating) headers['login-customer-id'] = ctx.manager
    const res = await fetch(`${GADS_API}/customers/${ctx.operating}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    let data: any = {}; try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
    if (!res.ok) {
        const fe = data?.error?.details?.[0]?.errors?.[0]
        throw new Error(`GAds ${method} ${path} → ${res.status}: ${fe?.message || data?.error?.message || text.slice(0, 300)}`)
    }
    return data
}

async function resolveAdsCtx(agent: MatehAgentRow): Promise<AdsCtx | null> {
    const cfg: any = (agent.googleAdsConfig as any) || (await db.select().from(instances).where(eq(instances.id, agent.vpsInstanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.loginCustomerId || cfg.customerId || '')
    const operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager)
    const dev = cfg.developerToken
    const rt = (agent.googleTokens as any)?.refreshToken || (agent.googleTokens as any)?.refresh_token
    if (!operating || !dev || !rt) return null
    const at = await accessToken(rt)
    if (!at) return null
    return { operating, manager, dev, at }
}

function businessName(agent: MatehAgentRow): string {
    const rd: any = agent.researchData || {}
    return rd.answers?.businessName || agent.name || 'Store'
}

/** Create or reuse the secondary offline store-orders conversion action. */
export async function ensureOfflineAction(agent: MatehAgentRow): Promise<OfflineUploadResult> {
    const ctx = await resolveAdsCtx(agent)
    if (!ctx) return { status: 'no_ads', reason: 'google_ads_not_connected' }
    const rd: any = agent.researchData || {}
    const name = `${businessName(agent)} — Store Orders (offline)`
    const { mutateResearchData } = await import('./agentContext')

    // Reuse if we already recorded it
    let resourceName: string | undefined = rd.offlineConversions?.actionResourceName
    if (!resourceName) {
        // Look for an existing action by name (idempotent across reruns)
        try {
            const q = `SELECT conversion_action.resource_name, conversion_action.name, conversion_action.type FROM conversion_action WHERE conversion_action.name = '${name.replace(/'/g, "\\'")}'`
            const sr = await ads(ctx, 'googleAds:search', { query: q })
            resourceName = (sr.results || [])[0]?.conversionAction?.resourceName
        } catch { /* fall through to create */ }
    }
    if (!resourceName) {
        const avg = rd.paidProfile?.avgDealValueIls || 100
        const createBody = {
            operations: [{
                create: {
                    name,
                    category: 'PURCHASE',
                    type: 'UPLOAD_CLICKS',
                    status: 'ENABLED',
                    primaryForGoal: false,   // SECONDARY — counted, not biddable
                    countingType: 'ONE_PER_CLICK',
                    clickThroughLookbackWindowDays: LOOKBACK_DAYS,
                    viewThroughLookbackWindowDays: 1,
                    valueSettings: { defaultValue: avg, defaultCurrencyCode: 'ILS', alwaysUseDefaultValue: false },
                },
            }],
            partialFailure: false, validateOnly: false,
        }
        try {
            const cr = await ads(ctx, 'conversionActions:mutate', createBody)
            resourceName = (cr.results || [])[0]?.resourceName
        } catch (e) { return { status: 'error', reason: `create_action_failed: ${(e as Error).message}` } }
        if (!resourceName) return { status: 'error', reason: 'create_action_no_resource_name' }
    }

    const watermark: string = rd.offlineConversions?.watermark || new Date().toISOString()
    await mutateResearchData(agent, agent.vpsInstanceId, (cur: any) => {
        const c = cur || {}
        c.offlineConversions = { ...(c.offlineConversions || {}), actionResourceName: resourceName, actionName: name, watermark, setupAt: c.offlineConversions?.setupAt || new Date().toISOString() }
        return c
    })
    return { status: 'ok', reason: 'action_ready', actionResourceName: resourceName, watermark }
}

/** Extract the raw gclid from a captured value. The companion plugin stores the
 * `_gcl_aw` Conversion Linker cookie, whose format is `GCL.<timestamp>.<gclid>`
 * — Ads' uploadClickConversions needs the bare <gclid>, not the whole cookie
 * (else "gclid could not be decoded"). A raw `gclid` cookie is passed through. */
function normalizeGclid(raw: string): string {
    const v = String(raw || '').trim()
    if (/^GCL\./i.test(v)) {
        const parts = v.split('.')
        // GCL . <timestamp> . <gclid...>  — gclids have no dots, but rejoin defensively
        if (parts.length >= 3) return parts.slice(2).join('.')
        return ''
    }
    return v
}

/** Format an ISO date as Google Ads conversionDateTime: "yyyy-MM-dd HH:mm:ss+00:00". */
function adsDateTime(iso: string): string {
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`
}

/** Upload new (post-watermark) store orders that carry a gclid to Google Ads.
 * dryRun → uploadClickConversions with validateOnly:true (Ads validates gclid +
 * action + payload, records NOTHING). watermarkOverride lets a self-test scan an
 * earlier window against real gclid orders without touching the stored watermark. */
export async function uploadNewStoreOrders(agent: MatehAgentRow, opts: { dryRun?: boolean; watermarkOverride?: string } = {}): Promise<OfflineUploadResult> {
    const dryRun = !!opts.dryRun
    const ctx = await resolveAdsCtx(agent)
    if (!ctx) return { status: 'no_ads', reason: 'google_ads_not_connected', dryRun }
    const rd: any = agent.researchData || {}
    const actionResourceName: string | undefined = rd.offlineConversions?.actionResourceName
    const storedWatermark: string | undefined = rd.offlineConversions?.watermark
    if (!actionResourceName || !storedWatermark) return { status: 'no_action', reason: 'run_ensureOfflineAction_first', dryRun }
    const watermark = opts.watermarkOverride || storedWatermark

    const wp = await loadWpConfig(agent.vpsInstanceId, agent.id)
    if (!wp) return { status: 'no_store', reason: 'wordpress_not_connected', dryRun }
    const base = wp.url.replace(/\/+$/, '')
    const auth = 'Basic ' + Buffer.from(`${wp.user}:${wp.appPassword}`).toString('base64')

    // Orders created after the watermark, paid (completed/processing).
    const after = encodeURIComponent(watermark)
    const url = `${base}/wp-json/wc/v3/orders?after=${after}&per_page=100&orderby=date&order=asc&status=completed,processing&_fields=id,date_created_gmt,total,currency,status,meta_data`
    let orders: any[]
    try {
        const r = await fetch(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(30000) })
        if (!r.ok) return { status: 'error', reason: `store_orders_http_${r.status}`, dryRun }
        orders = await r.json() as any[]
    } catch (e) { return { status: 'error', reason: `store_fetch: ${(e as Error).message}`, dryRun } }
    if (!Array.isArray(orders)) return { status: 'error', reason: 'store_orders_not_array', dryRun }

    const eligible: Array<{ id: number; gclid: string; dt: string; value: number; currency: string }> = []
    for (const o of orders) {
        const m: Record<string, any> = {}
        for (const md of o.meta_data || []) m[md.key] = md.value
        if (m['_clawflow_ads_uploaded']) continue
        const gclid = normalizeGclid(m['_clawflow_gclid'])
        if (!gclid) continue   // no paid click captured → not an Ads conversion (handled later by Enhanced Conversions PII path)
        eligible.push({ id: o.id, gclid, dt: adsDateTime(o.date_created_gmt + 'Z'), value: Number(o.total) || 0, currency: o.currency || 'ILS' })
    }

    const errors: string[] = []
    let uploaded = 0
    if (eligible.length) {
        // uploadClickConversions in one batch (partialFailure → per-row errors).
        // dryRun → validateOnly: Ads validates everything but records nothing.
        const conversions = eligible.map(e => ({
            gclid: e.gclid,
            conversionAction: actionResourceName,
            conversionDateTime: e.dt,
            conversionValue: e.value,
            currencyCode: e.currency,
            orderId: String(e.id),   // dedup key on Ads side
        }))
        try {
            const res = await ads(ctx, ':uploadClickConversions', { conversions, partialFailure: true, validateOnly: dryRun }, 'POST')
            const pf = res.partialFailureError
            const rowErrs: Record<number, string> = {}
            if (pf?.details?.length) {
                for (const d of pf.details) {
                    for (const er of d.errors || []) {
                        const idx = er.location?.fieldPathElements?.find((f: any) => f.fieldName === 'conversions')?.index
                        if (typeof idx === 'number') rowErrs[idx] = er.message
                    }
                }
            }
            for (let i = 0; i < eligible.length; i++) {
                if (rowErrs[i]) { errors.push(`#${eligible[i].id}: ${rowErrs[i]}`); continue }
                if (dryRun) { uploaded++; continue }   // validated OK (would upload)
                // mark uploaded on the store order (companion-managed meta)
                try {
                    await fetch(`${base}/wp-json/wc/v3/orders/${eligible[i].id}`, {
                        method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ meta_data: [{ key: '_clawflow_ads_uploaded', value: new Date().toISOString() }] }),
                        signal: AbortSignal.timeout(20000),
                    })
                } catch { /* mark best-effort; Ads dedup by orderId prevents double-count */ }
                uploaded++
            }
        } catch (e) { return { status: 'error', reason: `upload_failed: ${(e as Error).message}`, dryRun, eligible: eligible.length, scanned: orders.length } }
    }

    // Advance watermark to newest scanned order (so next run starts after it).
    // Skipped on dryRun and when scanning an override window (self-test).
    // HOLD on any error (e.g. just-created-action 6h cooldown, transient API):
    // the next run re-scans the same window and the `_clawflow_ads_uploaded`
    // meta (+ Ads orderId dedup) skips the ones that already succeeded, so a
    // transient failure never silently drops an order past the watermark.
    if (!dryRun && !opts.watermarkOverride && orders.length && errors.length === 0) {
        const newest = orders[orders.length - 1]?.date_created_gmt
        if (newest) {
            const { mutateResearchData } = await import('./agentContext')
            await mutateResearchData(agent, agent.vpsInstanceId, (cur: any) => {
                const c = cur || {}
                c.offlineConversions = { ...(c.offlineConversions || {}), watermark: new Date(newest + 'Z').toISOString(), lastRunAt: new Date().toISOString(), lastUploaded: uploaded }
                return c
            })
        }
    }

    console.log(`[offlineConversionUpload] ${agent.id}: scanned=${orders.length} eligible=${eligible.length} uploaded=${uploaded} dryRun=${dryRun}${errors.length ? ` errors=${errors.length}` : ''}`)
    return { status: 'ok', reason: dryRun ? 'dry_run' : 'uploaded', actionResourceName, watermark, scanned: orders.length, eligible: eligible.length, uploaded, dryRun, errors: errors.length ? errors : undefined }
}

/** Convenience: load agent row + ensure action + upload. Used by scripts/executor. */
export async function runOfflineUploadForAgent(agentId: string, opts: { dryRun?: boolean; watermarkOverride?: string } = {}): Promise<OfflineUploadResult> {
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    if (!agent) return { status: 'error', reason: `agent_not_found:${agentId}` }
    const ensured = await ensureOfflineAction(agent as MatehAgentRow)
    if (ensured.status !== 'ok') return ensured
    // reload to pick up the freshly written offlineConversions.actionResourceName/watermark
    const [fresh] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    return uploadNewStoreOrders(fresh as MatehAgentRow, opts)
}