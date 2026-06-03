/**
 * Conversion reconciliation (READ-ONLY forensics).
 * Reconciles, for one day: WooCommerce orders vs GA4 purchase events vs (optional)
 * the transaction_ids each has — to locate WHERE conversions are lost.
 *
 *   npx tsx src/scripts/test-conv-reconcile.ts <instanceId> <agentId> <YYYY-MM-DD>
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { loadWpConfig } from '@/services/seoMetaBatch'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'

async function refresh(rt: string): Promise<string | null> {
    const body = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' })
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    const j = await r.json() as any
    return j.access_token || null
}
async function resolveProperty(at: string, mid: string): Promise<string | null> {
    const r = await fetch(`${ADMIN_API}/accountSummaries?pageSize=200`, { headers: { Authorization: `Bearer ${at}` } })
    const j = await r.json() as any
    for (const a of j.accountSummaries || []) for (const p of a.propertySummaries || []) {
        const ds = await fetch(`${ADMIN_API}/${p.property}/dataStreams?pageSize=50`, { headers: { Authorization: `Bearer ${at}` } })
        const dj = await ds.json() as any
        for (const s of dj.dataStreams || []) if (s.webStreamData?.measurementId === mid) return p.property.replace('properties/', '')
    }
    return null
}
async function ga4Report(at: string, prop: string, date: string, dims: string[], filterEvent?: string) {
    const body: any = { dateRanges: [{ startDate: date, endDate: date }], dimensions: dims.map(d => ({ name: d })), metrics: [{ name: 'eventCount' }, { name: 'purchaseRevenue' }], limit: 1000 }
    if (filterEvent) body.dimensionFilter = { filter: { fieldName: 'eventName', stringFilter: { value: filterEvent } } }
    const r = await fetch(`${DATA_API}/properties/${prop}:runReport`, { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json() as any
    if (!r.ok) throw new Error(j?.error?.message || `GA4 ${r.status}`)
    return (j.rows || []).map((row: any) => ({ dims: row.dimensionValues.map((d: any) => d.value), count: Number(row.metricValues[0]?.value || 0), revenue: Number(row.metricValues[1]?.value || 0) }))
}

async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const agentId = process.argv[3] || 'mta_Un9jXRuf'
    const date = process.argv[4] || '2026-06-01'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rd: any = a.researchData || {}
    const mid = rd.mazhirGtm?.target?.measurementId
    const rt = (a.googleTokens as any)?.refreshToken || (a.googleTokens as any)?.refresh_token
    console.log(`\n=== reconcile ${agentId} (${rd.answers?.businessName}) date=${date} mid=${mid} ===`)

    // ── GA4 ──
    try {
        const at = await refresh(rt)
        const prop = at ? await resolveProperty(at, mid) : null
        console.log(`GA4 property: ${prop || '(unresolved!)'}`)
        if (at && prop) {
            const ev = await ga4Report(at, prop, date, ['eventName'])
            const purchase = ev.find((e: any) => e.dims[0] === 'purchase')
            console.log(`GA4 purchase: count=${purchase?.count || 0} revenue=${purchase?.revenue || 0}`)
            const keyEvents = ev.filter((e: any) => /purchase|lead|form|whatsapp|contact|conversion/i.test(e.dims[0]))
            console.log('GA4 conversion-ish events:', keyEvents.map((e: any) => `${e.dims[0]}=${e.count}`).join(', ') || '(none)')
            const byTxn = await ga4Report(at, prop, date, ['transactionId'], 'purchase')
            console.log(`GA4 purchase transactionIds (${byTxn.length}):`)
            for (const t of byTxn) console.log(`   txn=${t.dims[0]} count=${t.count} rev=${t.revenue}`)
        }
    } catch (e) { console.log('GA4 ERR:', (e as Error).message) }

    // ── WooCommerce orders ──
    try {
        const cfg = await loadWpConfig(instanceId, agentId)
        if (!cfg) { console.log('WC: no WP config'); }
        else {
            const auth = 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')
            const base = cfg.url.replace(/\/+$/, '')
            // Israel = UTC+3 → day window in UTC
            const after = `${date}T00:00:00`, before = `${date}T23:59:59`
            const url = `${base}/wp-json/wc/v3/orders?after=${after}&before=${before}&per_page=100&dates_are_gmt=false&_fields=id,number,status,total,currency,payment_method_title,transaction_id,date_created,date_paid`
            const r = await fetch(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(30000) })
            if (!r.ok) { console.log(`WC orders HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); }
            else {
                const orders = await r.json() as any[]
                console.log(`\nWooCommerce orders on ${date}: ${orders.length}`)
                const byStatus: Record<string, number> = {}
                for (const o of orders) { byStatus[o.status] = (byStatus[o.status] || 0) + 1 }
                console.log('by status:', JSON.stringify(byStatus))
                for (const o of orders) console.log(`   #${o.number} [${o.status}] ${o.total}${o.currency} pay="${o.payment_method_title}" txn=${o.transaction_id || '-'} created=${o.date_created} paid=${o.date_paid || '-'}`)
            }
        }
    } catch (e) { console.log('WC ERR:', (e as Error).message) }

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })