/** Make the store-orders (server-side gclid) action the PRIMARY purchase, demote
 * the broken GA4 web-purchase to secondary. validateOnly first, then --apply.
 *   node --env-file=.env --import tsx src/scripts/promote-offline-primary.ts [--apply]
 */
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
const ADS = 'https://googleads.googleapis.com/v22', TOKEN = 'https://oauth2.googleapis.com/token'
async function at(rt: string) { const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) }); return ((await r.json()) as any).access_token }
async function main() {
    const instanceId = '44f484a852', agentId = 'mta_Un9jXRuf', apply = process.argv.includes('--apply')
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rt = (a?.googleTokens as any)?.refreshToken || (a?.googleTokens as any)?.refresh_token
    const token = await at(rt)
    const cfg: any = (a?.googleAdsConfig as any) || (await db.select().from(instances).where(eq(instances.id, instanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.customerId || ''), operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager)
    const hdr = { Authorization: `Bearer ${token}`, 'developer-token': cfg.developerToken, 'login-customer-id': manager, 'Content-Type': 'application/json' }
    const OFFLINE = `customers/${operating}/conversionActions/7633865180`   // Store Orders (offline)
    const GA4WEB = `customers/${operating}/conversionActions/7321862550`    // packing station (web) purchase

    const body = { operations: [
        { updateMask: 'primary_for_goal', update: { resourceName: OFFLINE, primaryForGoal: true } },
        { updateMask: 'primary_for_goal', update: { resourceName: GA4WEB, primaryForGoal: false } },
    ], validateOnly: !apply, partialFailure: false }
    const r = await fetch(`${ADS}/customers/${operating}/conversionActions:mutate`, { method: 'POST', headers: hdr, body: JSON.stringify(body) })
    const j = await r.json() as any
    console.log(`${apply ? 'APPLY' : 'VALIDATE'} promote offline→P, GA4→s : ${r.ok ? 'OK' : 'ERR'}`)
    if (!r.ok) console.log('  ', JSON.stringify(j?.error?.details?.[0]?.errors?.[0]?.message || j?.error?.message || j).slice(0, 400))

    const search = async (q: string) => { const s = await fetch(`${ADS}/customers/${operating}/googleAds:search`, { method: 'POST', headers: hdr, body: JSON.stringify({ query: q }) }); const sj = await s.json() as any; if (!s.ok) { console.log('  qERR', JSON.stringify(sj?.error?.message || sj).slice(0,200)); return [] } return sj.results || [] }
    console.log(`\n=== PURCHASE actions now ===`)
    for (const row of await search(`SELECT conversion_action.name, conversion_action.primary_for_goal, conversion_action.type FROM conversion_action WHERE conversion_action.category = 'PURCHASE'`)) { const c = row.conversionAction; if (/packing|store orders|רכישות/i.test(c.name)) console.log(`  ${c.primaryForGoal ? 'P' : 's'} "${c.name}" (${c.type})`) }
    console.log(`\n=== Packing campaigns · 2026-06-03 (Conversions column) ===`)
    for (const row of await search(`SELECT campaign.name, metrics.conversions, metrics.all_conversions FROM campaign WHERE segments.date = '2026-06-03' AND metrics.impressions > 0`)) { const m = row.metrics, c = row.campaign; if (/packing/i.test(c.name)) console.log(`  "${c.name}": conv=${Number(m.conversions||0).toFixed(2)} allConv=${Number(m.allConversions||0).toFixed(2)}`) }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })