/** Consolidate Packing purchase conversions: keep ONE primary purchase action,
 * demote the duplicate to secondary (primary_for_goal=false). validateOnly first.
 *   node --env-file=.env --import tsx src/scripts/consolidate-purchase.ts <instanceId> <agentId> <demoteActionId> [--apply]
 */
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'

const ADS = 'https://googleads.googleapis.com/v22', TOKEN = 'https://oauth2.googleapis.com/token'
async function at(rt: string) { const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) }); return ((await r.json()) as any).access_token }

async function main() {
    const instanceId = process.argv[2], agentId = process.argv[3], demoteId = process.argv[4]
    const apply = process.argv.includes('--apply')
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rt = (a?.googleTokens as any)?.refreshToken || (a?.googleTokens as any)?.refresh_token
    const token = await at(rt)
    const cfg: any = (a?.googleAdsConfig as any) || (await db.select().from(instances).where(eq(instances.id, instanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.customerId || ''), operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager)
    const hdr = { Authorization: `Bearer ${token}`, 'developer-token': cfg.developerToken, 'login-customer-id': manager, 'Content-Type': 'application/json' }
    const resourceName = `customers/${operating}/conversionActions/${demoteId}`

    const body = { operations: [{ updateMask: 'primary_for_goal', update: { resourceName, primaryForGoal: false } }], validateOnly: !apply, partialFailure: false }
    const r = await fetch(`${ADS}/customers/${operating}/conversionActions:mutate`, { method: 'POST', headers: hdr, body: JSON.stringify(body) })
    const j = await r.json() as any
    console.log(`${apply ? 'APPLY' : 'VALIDATE'} demote ${demoteId} → primaryForGoal=false : ${r.ok ? 'OK' : 'ERR'}`)
    if (!r.ok) console.log('  ', JSON.stringify(j?.error?.details?.[0]?.errors?.[0]?.message || j?.error?.message || j).slice(0, 400))

    // re-show purchase actions
    const sr = await fetch(`${ADS}/customers/${operating}/googleAds:search`, { method: 'POST', headers: hdr, body: JSON.stringify({ query: `SELECT conversion_action.name, conversion_action.primary_for_goal, conversion_action.status, conversion_action.type FROM conversion_action WHERE conversion_action.category = 'PURCHASE'` }) })
    const sj = await sr.json() as any
    console.log(`\n=== PURCHASE actions now ===`)
    for (const row of (sj.results || [])) { const c = row.conversionAction; console.log(`  ${c.primaryForGoal ? 'P' : 's'} [${c.status}] "${c.name}" (${c.type})`) }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })