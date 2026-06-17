/** READ-ONLY: does the now-primary offline action count in metrics.conversions? */
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
    const offRes = (a?.researchData as any)?.offlineConversions?.actionResourceName
    const search = async (q: string) => { const r = await fetch(`${ADS}/customers/${operating}/googleAds:search`, { method: 'POST', headers: hdr, body: JSON.stringify({ query: q }) }); const j = await r.json() as any; if (!r.ok) { console.log('ERR', JSON.stringify(j?.error?.message || j).slice(0, 300)); return [] } return j.results || [] }

    console.log('=== offline action — conversions vs all_conversions, by date (last 7d) ===')
    for (const r of await search(`SELECT segments.date, metrics.conversions, metrics.all_conversions, metrics.all_conversions_value FROM conversion_action WHERE conversion_action.resource_name = '${offRes}' AND segments.date DURING LAST_7_DAYS ORDER BY segments.date`)) {
        const m = r.metrics; const c = Number(m?.conversions || 0), ac = Number(m?.allConversions || 0)
        if (c > 0 || ac > 0) console.log(`  ${r.segments?.date}: conversions=${c.toFixed(2)} · all_conversions=${ac.toFixed(2)} · ₪${Math.round(Number(m?.allConversionsValue || 0))}`)
    }

    console.log('\n=== offline action settings ===')
    for (const r of await search(`SELECT conversion_action.name, conversion_action.primary_for_goal, conversion_action.status, conversion_action.include_in_conversions_metric, conversion_action.counting_type FROM conversion_action WHERE conversion_action.resource_name = '${offRes}'`)) {
        const c = r.conversionAction; console.log(`  "${c.name}" primaryForGoal=${c.primaryForGoal} includeInConversions=${c.includeInConversionsMetric} status=${c.status} counting=${c.countingType}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })