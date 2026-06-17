/** READ-ONLY: inspect all conversion actions + customer conversion goals to plan
 * a safe purchase-action consolidation.
 *   node --env-file=.env --import tsx src/scripts/inspect-conv-actions.ts <instanceId> <agentId>
 */
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
    const search = async (q: string) => { const r = await fetch(`${ADS}/customers/${operating}/googleAds:search`, { method: 'POST', headers: hdr, body: JSON.stringify({ query: q }) }); const j = await r.json() as any; if (!r.ok) { console.log('  ERR', JSON.stringify(j?.error?.message || j).slice(0, 300)); return [] } return j.results || [] }

    console.log(`operating=${operating}`)
    console.log(`\n=== ALL conversion actions ===`)
    const acts = await search(`SELECT conversion_action.resource_name, conversion_action.name, conversion_action.type, conversion_action.category, conversion_action.status, conversion_action.primary_for_goal, conversion_action.origin FROM conversion_action ORDER BY conversion_action.name`)
    for (const r of acts) { const c = r.conversionAction; console.log(`  ${c.primaryForGoal ? 'P' : 's'} [${c.status}] "${c.name}" type=${c.type} cat=${c.category} origin=${c.origin} ${c.resourceName.split('/').pop()}`) }

    console.log(`\n=== customer conversion goals (what bidding optimizes) ===`)
    const goals = await search(`SELECT customer_conversion_goal.category, customer_conversion_goal.origin, customer_conversion_goal.biddable FROM customer_conversion_goal`)
    for (const r of goals) { const g = r.customerConversionGoal; console.log(`  ${g.biddable ? 'BIDDABLE' : 'secondary'} cat=${g.category} origin=${g.origin}`) }

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })