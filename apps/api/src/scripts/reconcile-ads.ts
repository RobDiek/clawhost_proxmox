/** READ-ONLY: reconcile site purchases vs Google Ads recorded conversions for a date range.
 *   node --env-file=.env --import tsx src/scripts/reconcile-ads.ts <instanceId> <agentId> <start> <end>
 */
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { loadWpConfig } from '@/services/seoMetaBatch'

const ADS = 'https://googleads.googleapis.com/v22', ADMIN = 'https://analyticsadmin.googleapis.com/v1beta', DATA = 'https://analyticsdata.googleapis.com/v1beta', TOKEN = 'https://oauth2.googleapis.com/token'

async function at(rt: string) { const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) }); return ((await r.json()) as any).access_token }

async function main() {
    const instanceId = process.argv[2] || '44f484a852', agentId = process.argv[3] || 'mta_Un9jXRuf'
    const start = process.argv[4] || '2026-06-02', end = process.argv[5] || '2026-06-04'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rt = (a?.googleTokens as any)?.refreshToken || (a?.googleTokens as any)?.refresh_token
    const token = await at(rt)

    // 1) WooCommerce orders in range
    const wp = await loadWpConfig(instanceId, agentId) as any
    const auth = 'Basic ' + Buffer.from(`${wp.user}:${wp.appPassword}`).toString('base64')
    const url = `${wp.url.replace(/\/+$/, '')}/wp-json/wc/v3/orders?after=${start}T00:00:00&before=${end}T23:59:59&per_page=100&status=completed,processing&_fields=id,total,date_created_gmt,meta_data`
    const orders = await (await fetch(url, { headers: { Authorization: auth } })).json() as any[]
    let total = 0, val = 0, withGclid = 0, gclidVal = 0, uploaded = 0
    for (const o of (orders || [])) {
        total++; val += Number(o.total) || 0
        const m: any = {}; for (const md of o.meta_data || []) m[md.key] = md.value
        if (m['_clawflow_gclid']) { withGclid++; gclidVal += Number(o.total) || 0 }
        if (m['_clawflow_ads_uploaded']) uploaded++
    }
    console.log(`\n=== WooCommerce orders ${start}..${end} (paid) ===`)
    console.log(`  total: ${total} · value ₪${Math.round(val)}`)
    console.log(`  with gclid (ad-driven → should be in Ads): ${withGclid} · ₪${Math.round(gclidVal)}`)
    console.log(`  already uploaded to Ads (offline): ${uploaded}`)

    // 2) GA4 purchases by first-user source
    const mid = (a?.researchData as any)?.mazhirGtm?.target?.measurementId
    const sj = await (await fetch(`${ADMIN}/accountSummaries?pageSize=200`, { headers: { Authorization: `Bearer ${token}` } })).json() as any
    let prop = ''
    for (const ac of sj.accountSummaries || []) for (const p of ac.propertySummaries || []) { const dj = await (await fetch(`${ADMIN}/${p.property}/dataStreams?pageSize=50`, { headers: { Authorization: `Bearer ${token}` } })).json() as any; for (const s of dj.dataStreams || []) if (s.webStreamData?.measurementId === mid) prop = p.property.replace('properties/', '') }
    if (prop) {
        const r = await fetch(`${DATA}/properties/${prop}:runReport`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ dateRanges: [{ startDate: start, endDate: end }], dimensions: [{ name: 'firstUserSourceMedium' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'purchase' } } } }) })
        const j = await r.json() as any
        console.log(`\n=== GA4 purchase events ${start}..${end} by first-user source ===`)
        for (const row of (j.rows || [])) console.log(`  ${row.dimensionValues[0].value}: ${row.metricValues[0].value}`)
    }

    // 3) Google Ads conversions per action in range
    const cfg: any = (a?.googleAdsConfig as any) || (await db.select().from(instances).where(eq(instances.id, instanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.customerId || ''), operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager), dev = cfg.developerToken
    const gaql = `SELECT conversion_action.name, conversion_action.primary_for_goal, metrics.all_conversions, metrics.all_conversions_value FROM conversion_action WHERE segments.date BETWEEN '${start}' AND '${end}'`
    const ar = await fetch(`${ADS}/customers/${operating}/googleAds:search`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'developer-token': dev, 'login-customer-id': manager, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: gaql }) })
    const aj = await ar.json() as any
    console.log(`\n=== Google Ads conversions ${start}..${end} (operating ${operating}) ===`)
    if (!ar.ok) { console.log('  Ads err:', JSON.stringify(aj?.error?.message || aj).slice(0, 200)) }
    for (const row of (aj.results || [])) {
        const c = Number(row.metrics?.allConversions || 0)
        if (c > 0 || /packing|store orders/i.test(row.conversionAction?.name || '')) console.log(`  ${row.conversionAction?.primaryForGoal ? 'P' : 's'} "${row.conversionAction?.name}": ${c.toFixed(2)} conv · ₪${Math.round(Number(row.metrics?.allConversionsValue || 0))}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })