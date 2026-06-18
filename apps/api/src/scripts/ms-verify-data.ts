/** MS — verify on REAL data: GA4 purchases (14d), WooCommerce recent orders +
 *  gclid coverage (via the offline-bridge dry-run), and Ads conversions (14d).
 *   node --env-file=.env --import tsx src/scripts/ms-verify-data.ts
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { uploadNewStoreOrders } from '@/services/offlineConversionUpload'

const AGENT = 'mta_Xm8CfS3K'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'
const ADS = 'https://googleads.googleapis.com/v22'
const MID = 'G-JS48GDEL9H', MS_CAMPAIGN = '23066805751'

async function at(rt: string) {
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
    return ((await r.json()) as any).access_token
}
async function resolveProp(tok: string) {
    const j = await (await fetch(`${ADMIN_API}/accountSummaries?pageSize=200`, { headers: { Authorization: `Bearer ${tok}` } })).json() as any
    for (const a of j.accountSummaries || []) for (const p of a.propertySummaries || []) {
        const dj = await (await fetch(`${ADMIN_API}/${p.property}/dataStreams?pageSize=50`, { headers: { Authorization: `Bearer ${tok}` } })).json() as any
        for (const s of dj.dataStreams || []) if (s.webStreamData?.measurementId === MID) return p.property.replace('properties/', '')
    }
    return null
}

async function main() {
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    const gt: any = agent!.googleTokens || {}
    const cfg: any = agent!.googleAdsConfig || {}
    const tok = await at(gt.refreshToken)

    // 1. GA4 purchases (14d)
    console.log('═══ GA4 purchases (last 14d) ═══')
    const prop = await resolveProp(tok)
    if (!prop) console.log('  GA4 property not resolved')
    else {
        const body = { dateRanges: [{ startDate: '14daysAgo', endDate: 'yesterday' }], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }, { name: 'purchaseRevenue' }], dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['purchase', 'in_app_purchase', 'ecommerce_purchase'] } } } }
        const r = await fetch(`${DATA_API}/properties/${prop}:runReport`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const j = await r.json() as any
        const rows = j.rows || []
        if (!rows.length) console.log('  ⚠ 0 purchase events in GA4 (14d) — GA4 ecommerce purchase NOT firing')
        for (const row of rows) console.log(`  ${row.dimensionValues[0].value}: ${row.metricValues[0].value} events · ₪${Math.round(Number(row.metricValues[1].value || 0))}`)
        // also total all events to confirm GA4 receives data at all
        const allBody = { dateRanges: [{ startDate: '14daysAgo', endDate: 'yesterday' }], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], limit: 15, orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }] }
        const ar = await (await fetch(`${DATA_API}/properties/${prop}:runReport`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(allBody) })).json() as any
        console.log('  top GA4 events (14d):', (ar.rows || []).map((x: any) => `${x.dimensionValues[0].value}=${x.metricValues[0].value}`).join(', '))
    }

    // 2. WooCommerce orders + gclid coverage (offline-bridge dry-run, 14d window)
    console.log('\n═══ WooCommerce orders + gclid (last ~14d, bridge dry-run) ═══')
    const wm = '2026-06-04T00:00:00.000Z'
    const up = await uploadNewStoreOrders(agent as any, { dryRun: true, watermarkOverride: wm })
    console.log(`  scanned=${up.scanned} eligible(gclid)=${up.eligible} status=${up.status}`)

    // 3. Ads conversions (14d) on MS campaign
    console.log('\n═══ Ads conversions (14d) — MS campaign ═══')
    const operating = '5746845784', login = '5898711892'
    const r = await fetch(`${ADS}/customers/${operating}/googleAds:search`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'developer-token': cfg.developerToken, 'login-customer-id': login, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `SELECT campaign.name, metrics.conversions, metrics.conversions_value, metrics.all_conversions, metrics.clicks FROM campaign WHERE campaign.id = ${MS_CAMPAIGN} AND segments.date DURING LAST_14_DAYS` }) })
    const j = await r.json() as any
    for (const row of (j.results || [])) console.log(`  ${row.campaign.name}: conv=${row.metrics.conversions} allConv=${row.metrics.allConversions} value=₪${Math.round(Number(row.metrics.conversionsValue || 0))} clicks=${row.metrics.clicks}`)
    if (!j.results?.length) console.log('  (no rows)', JSON.stringify(j?.error?.message || ''))

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })