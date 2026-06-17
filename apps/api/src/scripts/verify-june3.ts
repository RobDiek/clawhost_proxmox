/** READ-ONLY: exactly what Google Ads holds for Packing on 2026-06-03. */
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
    const search = async (q: string) => { const r = await fetch(`${ADS}/customers/${operating}/googleAds:search`, { method: 'POST', headers: hdr, body: JSON.stringify({ query: q }) }); const j = await r.json() as any; if (!r.ok) { console.log('  ERR', JSON.stringify(j?.error?.message || j).slice(0, 300)); return [] } return j.results || [] }

    // A) Packing campaigns on June 3 (CLICK date = default cabinet view)
    console.log(`=== A) Packing campaigns · 2026-06-03 (default = by CLICK date) ===`)
    const camps = await search(`SELECT campaign.name, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.all_conversions, metrics.all_conversions_value FROM campaign WHERE segments.date = '2026-06-03' AND metrics.impressions > 0 ORDER BY campaign.name`)
    for (const r of camps) { const m = r.metrics, c = r.campaign; if (/packing/i.test(c.name)) console.log(`  "${c.name}": clicks=${m.clicks} cost=₪${Math.round(Number(m.costMicros||0)/1e6)} conv=${Number(m.conversions||0).toFixed(2)} allConv=${Number(m.allConversions||0).toFixed(2)} ₪${Math.round(Number(m.allConversionsValue||0))}`) }

    // B) Every Packing purchase action on June 3 (by click date)
    console.log(`\n=== B) Packing purchase actions · 2026-06-03 (by CLICK date) ===`)
    const b = await search(`SELECT conversion_action.name, conversion_action.primary_for_goal, metrics.all_conversions, metrics.all_conversions_value FROM conversion_action WHERE segments.date = '2026-06-03'`)
    for (const r of b) { const n = r.conversionAction?.name||''; if (/packing|store orders|רכישות/i.test(n)) console.log(`  ${r.conversionAction?.primaryForGoal?'P':'s'} "${n}": ${Number(r.metrics?.allConversions||0).toFixed(2)} conv ₪${Math.round(Number(r.metrics?.allConversionsValue||0))}`) }

    // C) Offline action — conversions that OCCURRED on June 3 (by conversion time, range filter no segment)
    console.log(`\n=== C) Offline action lifetime registered (last 90d, by conversion date) ===`)
    const offRes = (a?.researchData as any)?.offlineConversions?.actionResourceName
    const c = await search(`SELECT metrics.all_conversions, metrics.all_conversions_value FROM conversion_action WHERE conversion_action.resource_name = '${offRes}' AND segments.date DURING LAST_90_DAYS`)
    for (const r of c) console.log(`  total: ${Number(r.metrics?.all_conversions||r.metrics?.allConversions||0).toFixed(2)} conv ₪${Math.round(Number(r.metrics?.allConversionsValue||0))}`)

    // D) Offline action by CLICK date, last 14d (where conversions land)
    console.log(`\n=== D) Offline action by CLICK date (last 14d) ===`)
    const d = await search(`SELECT segments.date, metrics.all_conversions FROM conversion_action WHERE conversion_action.resource_name = '${offRes}' AND segments.date DURING LAST_14_DAYS ORDER BY segments.date`)
    for (const r of d) { const v = Number(r.metrics?.allConversions||0); if (v>0) console.log(`  ${r.segments?.date}: ${v.toFixed(2)}`) }

    console.log(`\n(note: 8 June-1 orders were uploaded minutes ago — offline conversions take up to ~3h to process, so they may not be counted above yet)`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })