/** READ-ONLY: Packing campaign Conversions vs All-conv, by date (last 6 days). */
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
const ADS = 'https://googleads.googleapis.com/v22', TOKEN = 'https://oauth2.googleapis.com/token'
async function at(rt: string) { const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) }); return ((await r.json()) as any).access_token }
async function main() {
    const instanceId = '44f484a852', agentId = 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rt = (a?.googleTokens as any)?.refreshToken || (a?.googleTokens as any)?.refresh_token
    const token = await at(rt)
    const cfg: any = (a?.googleAdsConfig as any) || (await db.select().from(instances).where(eq(instances.id, instanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.customerId || ''), operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager)
    const hdr = { Authorization: `Bearer ${token}`, 'developer-token': cfg.developerToken, 'login-customer-id': manager, 'Content-Type': 'application/json' }
    const r = await fetch(`${ADS}/customers/${operating}/googleAds:search`, { method: 'POST', headers: hdr, body: JSON.stringify({ query: `SELECT segments.date, campaign.name, metrics.conversions, metrics.all_conversions, metrics.all_conversions_value FROM campaign WHERE segments.date DURING LAST_7_DAYS AND metrics.impressions > 0 ORDER BY segments.date` }) })
    const j = await r.json() as any
    if (!r.ok) { console.log('ERR', JSON.stringify(j?.error?.message || j).slice(0, 300)); process.exit(1) }
    console.log('date       | campaign                         | Conversions | All-conv | value')
    for (const row of (j.results || [])) {
        const n = row.campaign?.name || ''; if (!/packing/i.test(n)) continue
        const m = row.metrics
        console.log(`${row.segments?.date} | ${n.slice(0, 32).padEnd(32)} | ${Number(m.conversions || 0).toFixed(2).padStart(8)} | ${Number(m.allConversions || 0).toFixed(2).padStart(6)} | ₪${Math.round(Number(m.allConversionsValue || 0))}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })