/** READ-ONLY deep diagnostic: why does "yesterday" show 0 conversions for Packing?
 *   node --env-file=.env --import tsx src/scripts/diag-offline-yesterday.ts <instanceId> <agentId>
 * Shows: recent gclid orders, Google's validateOnly verdict per order, and the
 * actual click-date distribution of the offline + primary purchase conversions.
 */
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { loadWpConfig } from '@/services/seoMetaBatch'

const ADS = 'https://googleads.googleapis.com/v22', TOKEN = 'https://oauth2.googleapis.com/token'

async function at(rt: string) {
    const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
    return ((await r.json()) as any).access_token
}
function normGclid(raw: string): string {
    const v = String(raw || '').trim()
    if (/^GCL\./i.test(v)) { const p = v.split('.'); return p.length >= 3 ? p.slice(2).join('.') : '' }
    return v
}
function adsDt(iso: string): string {
    const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`
}

async function main() {
    const instanceId = process.argv[2] || '44f484a852', agentId = process.argv[3] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rt = (a?.googleTokens as any)?.refreshToken || (a?.googleTokens as any)?.refresh_token
    const token = await at(rt)
    const cfg: any = (a?.googleAdsConfig as any) || (await db.select().from(instances).where(eq(instances.id, instanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.customerId || ''), operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager), dev = cfg.developerToken
    const rd: any = a?.researchData || {}
    const offlineAction = rd.offlineConversions?.actionResourceName
    console.log(`operating=${operating} manager=${manager} offlineAction=${offlineAction}`)

    const hdr = { Authorization: `Bearer ${token}`, 'developer-token': dev, 'login-customer-id': manager, 'Content-Type': 'application/json' }
    const search = async (q: string) => {
        const r = await fetch(`${ADS}/customers/${operating}/googleAds:search`, { method: 'POST', headers: hdr, body: JSON.stringify({ query: q }) })
        const j = await r.json() as any; if (!r.ok) console.log('  search err:', JSON.stringify(j?.error?.message || j).slice(0, 300)); return j.results || []
    }

    // 1) Recent gclid orders (last 7 days), regardless of uploaded flag
    const wp = await loadWpConfig(instanceId, agentId) as any
    const auth = 'Basic ' + Buffer.from(`${wp.user}:${wp.appPassword}`).toString('base64')
    const start = '2026-05-28'
    const url = `${wp.url.replace(/\/+$/, '')}/wp-json/wc/v3/orders?after=${start}T00:00:00&per_page=100&orderby=date&order=asc&status=completed,processing&_fields=id,total,currency,date_created_gmt,status,meta_data`
    const orders = await (await fetch(url, { headers: { Authorization: auth } })).json() as any[]
    const gclidOrders: any[] = []
    for (const o of orders || []) {
        const m: any = {}; for (const md of o.meta_data || []) m[md.key] = md.value
        const g = normGclid(m['_clawflow_gclid'])
        if (g) gclidOrders.push({ id: o.id, date: o.date_created_gmt, total: o.total, currency: o.currency || 'ILS', gclid: g, gclidRaw: String(m['_clawflow_gclid']).slice(0, 12), uploaded: !!m['_clawflow_ads_uploaded'] })
    }
    console.log(`\n=== gclid orders since ${start} (${gclidOrders.length}) ===`)
    for (const o of gclidOrders) console.log(`  #${o.id} ${o.date} ₪${o.total} ${o.uploaded ? 'UPLOADED' : 'not-uploaded'} gclid=${o.gclid.slice(0, 16)}… (raw ${o.gclidRaw})`)

    // 2) Google's validateOnly verdict for ALL these gclids (does Google accept them?)
    console.log(`\n=== Google validateOnly verdict (does it accept each gclid?) ===`)
    const conversions = gclidOrders.map(o => ({ gclid: o.gclid, conversionAction: offlineAction, conversionDateTime: adsDt(o.date + 'Z'), conversionValue: Number(o.total) || 0, currencyCode: o.currency, orderId: String(o.id) }))
    const vr = await fetch(`${ADS}/customers/${operating}/:uploadClickConversions`, { method: 'POST', headers: hdr, body: JSON.stringify({ conversions, partialFailure: true, validateOnly: true }) })
    const vj = await vr.json() as any
    if (!vr.ok) { console.log('  upload err:', JSON.stringify(vj?.error?.message || vj).slice(0, 400)) }
    const rowErr: Record<number, string> = {}
    for (const d of vj.partialFailureError?.details || []) for (const er of d.errors || []) { const idx = er.location?.fieldPathElements?.find((f: any) => f.fieldName === 'conversions')?.index; if (typeof idx === 'number') rowErr[idx] = er.message }
    for (let i = 0; i < gclidOrders.length; i++) console.log(`  #${gclidOrders[i].id}: ${rowErr[i] ? '❌ ' + rowErr[i] : '✅ accepted'}`)

    // 3) Offline action conversions by CLICK date (last 30d) — where did they land?
    if (offlineAction) {
        console.log(`\n=== offline action conversions BY DATE (last 30d) — this is CLICK date ===`)
        const rows = await search(`SELECT segments.date, metrics.all_conversions, metrics.all_conversions_value FROM conversion_action WHERE conversion_action.resource_name = '${offlineAction}' AND segments.date DURING LAST_30_DAYS ORDER BY segments.date`)
        for (const r of rows) { const c = Number(r.metrics?.allConversions || 0); if (c > 0) console.log(`  ${r.segments?.date}: ${c.toFixed(2)} conv · ₪${Math.round(Number(r.metrics?.allConversionsValue || 0))}`) }
    }

    // 4) ALL Packing purchase-ish actions by date (last 14d)
    console.log(`\n=== Packing purchase actions BY DATE (last 14d) ===`)
    const rows = await search(`SELECT segments.date, conversion_action.name, conversion_action.primary_for_goal, metrics.all_conversions FROM conversion_action WHERE segments.date DURING LAST_14_DAYS AND metrics.all_conversions > 0 ORDER BY segments.date`)
    for (const r of rows) { const n = r.conversionAction?.name || ''; if (/packing|store orders|רכישות/i.test(n)) console.log(`  ${r.segments?.date} ${r.conversionAction?.primaryForGoal ? 'P' : 's'} "${n}": ${Number(r.metrics?.allConversions || 0).toFixed(2)}`) }

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })