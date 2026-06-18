/** Read-only: which custom conversion goal each scoped campaign uses on the
 *  shared account — detect cross-brand goal sharing (contamination).
 *   node --env-file=.env --import tsx src/scripts/ms-check-goals.ts
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADS = 'https://googleads.googleapis.com/v22'

async function at(rt: string) {
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
    return ((await r.json()) as any).access_token
}
async function q(cust: string, login: string, dev: string, tok: string, query: string) {
    const r = await fetch(`${ADS}/customers/${cust}/googleAds:searchStream`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'developer-token': dev, 'login-customer-id': login, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
    const d = await r.json() as any
    if (!r.ok) throw new Error(JSON.stringify(d?.error?.message || d).slice(0, 200))
    const out: any[] = []; for (const b of (Array.isArray(d) ? d : [d])) for (const x of (b.results || [])) out.push(x)
    return out
}

async function main() {
    const [ms] = await db.select().from(matehAgents).where(eq(matehAgents.id, 'mta_Xm8CfS3K'))
    const cfg: any = ms!.googleAdsConfig
    const operating = '5746845784', login = '5898711892', dev = cfg.developerToken
    const tok = await at((ms!.googleTokens as any).refreshToken)

    console.log('═══ campaign → goal level + custom goal ═══')
    const rows = await q(operating, login, dev, tok, `SELECT campaign.id, campaign.name, conversion_goal_campaign_config.goal_config_level, conversion_goal_campaign_config.custom_conversion_goal FROM conversion_goal_campaign_config`)
    const goalUse = new Map<string, string[]>()
    for (const r of rows) {
        const c = r.conversionGoalCampaignConfig || {}
        const goal = c.customConversionGoal || `(${c.goalConfigLevel})`
        console.log(`  ${r.campaign?.name} (${r.campaign?.id}) → ${c.goalConfigLevel} · ${goal}`)
        if (c.customConversionGoal) { if (!goalUse.has(goal)) goalUse.set(goal, []); goalUse.get(goal)!.push(String(r.campaign?.id)) }
    }
    console.log('\n═══ custom goals (name + actions + which campaigns) ═══')
    const goals = await q(operating, login, dev, tok, `SELECT custom_conversion_goal.resource_name, custom_conversion_goal.name, custom_conversion_goal.conversion_actions FROM custom_conversion_goal`)
    for (const g of goals) {
        const cg = g.customConversionGoal || {}
        const used = goalUse.get(cg.resourceName) || []
        if (used.length || /flowmatic|isolated/i.test(cg.name || '')) {
            console.log(`  "${cg.name}" [${cg.resourceName}] · actions=${(cg.conversionActions || []).length} · usedBy=${JSON.stringify(used)}`)
        }
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })