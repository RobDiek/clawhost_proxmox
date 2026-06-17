/** READ-ONLY: check auto-tagging + conversion tracking status on the Ads account. */
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
const ADS = 'https://googleads.googleapis.com/v22', TOKEN = 'https://oauth2.googleapis.com/token'
async function at(rt: string) { const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) }); return ((await r.json()) as any).access_token }
async function main() {
    const instanceId = process.argv[2] || '44f484a852', agentId = process.argv[3] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rt = (a?.googleTokens as any)?.refreshToken || (a?.googleTokens as any)?.refresh_token
    const token = await at(rt)
    const cfg: any = (a?.googleAdsConfig as any) || (await db.select().from(instances).where(eq(instances.id, instanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.customerId || ''), operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager)
    const hdr = { Authorization: `Bearer ${token}`, 'developer-token': cfg.developerToken, 'login-customer-id': manager, 'Content-Type': 'application/json' }
    const r = await fetch(`${ADS}/customers/${operating}/googleAds:search`, { method: 'POST', headers: hdr, body: JSON.stringify({ query: `SELECT customer.id, customer.descriptive_name, customer.auto_tagging_enabled, customer.conversion_tracking_setting.conversion_tracking_status, customer.conversion_tracking_setting.google_ads_conversion_customer FROM customer` }) })
    const j = await r.json() as any
    if (!r.ok) { console.log('ERR', JSON.stringify(j).slice(0, 400)); process.exit(1) }
    const c = j.results?.[0]?.customer
    console.log(`account ${c?.id} "${c?.descriptiveName}"`)
    console.log(`  auto_tagging_enabled = ${c?.autoTaggingEnabled}`)
    console.log(`  conversion_tracking_status = ${c?.conversionTrackingSetting?.conversionTrackingStatus}`)
    console.log(`  google_ads_conversion_customer = ${c?.conversionTrackingSetting?.googleAdsConversionCustomer}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })