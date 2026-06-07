/** READ-ONLY: verify Packing campaigns are isolated to a Packing-only custom
 * conversion goal (not the shared account-level PURCHASE goal that also contains
 * Moving Station's purchases). No writes.
 *   node --env-file=.env --import tsx src/scripts/verify-packing-goal-isolation.ts
 */
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

    console.log(`operating=${operating}  scope.campaignIds=${JSON.stringify(cfg.scope?.campaignIds || [])}`)

    console.log(`\n=== custom conversion goals (id · name · actions) ===`)
    const cg = await search(`SELECT custom_conversion_goal.id, custom_conversion_goal.name, custom_conversion_goal.conversion_actions FROM custom_conversion_goal`)
    for (const r of cg) { const g = r.customConversionGoal; console.log(`  #${g.id} "${g.name}" → ${(g.conversionActions || []).map((x: string) => x.split('/').pop()).join(', ')}`) }
    if (!cg.length) console.log('  (none — no campaign-specific custom goals exist)')

    console.log(`\n=== per-campaign goal config (which goal each campaign bids on) ===`)
    const cfgs = await search(`SELECT campaign.id, campaign.name, campaign.status, conversion_goal_campaign_config.goal_config_level, conversion_goal_campaign_config.custom_conversion_goal FROM conversion_goal_campaign_config`)
    for (const r of cfgs) {
        const c = r.campaign, gc = r.conversionGoalCampaignConfig || {}
        const lvl = gc.goalConfigLevel || '?'
        const custom = gc.customConversionGoal ? gc.customConversionGoal.split('/').pop() : '—'
        console.log(`  [${c.status}] "${c.name}" (${c.id}) → level=${lvl} custom=${custom}`)
    }
    if (!cfgs.length) console.log('  (no rows — all campaigns inherit ACCOUNT default goals)')

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })