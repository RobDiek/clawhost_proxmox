/** FIX cross-brand goal contamination: custom goal 6457834220 (Packing) is
 *  shared by Moving's campaign 23066805751 AND Packing's campaigns, and a resync
 *  overwrote it with Moving's offline action. Split them:
 *    1. create a Moving-only goal [7653142208], point 23066805751 at it
 *    2. restore 6457834220 to Packing's primary purchase action(s)
 *   node --env-file=.env --import tsx src/scripts/ms-fix-goal-split.ts [--apply]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { listConversionActions } from '@/services/mazhirConversions'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADS = 'https://googleads.googleapis.com/v22'
const OPERATING = '5746845784', LOGIN = '5898711892'
const MS_CAMPAIGN = '23066805751'
const MS_OFFLINE = 'customers/5746845784/conversionActions/7653142208'
const PACKING_GOAL = 'customers/5746845784/customConversionGoals/6457834220'

async function at(rt: string) {
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
    return ((await r.json()) as any).access_token
}
async function mutate(tok: string, dev: string, path: string, body: any) {
    const r = await fetch(`${ADS}/customers/${OPERATING}/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'developer-token': dev, 'login-customer-id': LOGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json() as any
    if (!r.ok) throw new Error(JSON.stringify(d?.error?.details?.[0]?.errors?.[0] || d?.error?.message || d).slice(0, 300))
    return d
}

async function main() {
    const apply = process.argv.includes('--apply')
    const [ms] = await db.select().from(matehAgents).where(eq(matehAgents.id, 'mta_Xm8CfS3K'))
    const [ps] = await db.select().from(matehAgents).where(eq(matehAgents.id, 'mta_Un9jXRuf'))
    const dev = (ms!.googleAdsConfig as any).developerToken
    const tok = await at((ms!.googleTokens as any).refreshToken)

    // Packing's primary purchase action(s) — to restore 6457834220.
    const psCfg: any = ps!.googleAdsConfig
    const psTok = await at((ps!.googleTokens as any).refreshToken)
    const psActions = await listConversionActions(OPERATING, { refreshToken: (ps!.googleTokens as any).refreshToken } as any, psCfg.developerToken, LOGIN)
    const packingPrimary = psActions.filter(a => a.category === 'PURCHASE' && a.primaryForGoal && /packing/i.test(a.name))
    console.log(apply ? '⚙  APPLY\n' : '👀 DRY-RUN\n')
    console.log('Packing primary PURCHASE actions (→ restore into 6457834220):')
    for (const a of packingPrimary) console.log(`  • ${a.name} [${a.resourceName}]`)
    if (packingPrimary.length === 0) { console.log('⚠ no Packing primary purchase found — ABORT (need to know what to restore)'); process.exit(1) }
    console.log(`\nMoving goal to create: "Flowmatic isolated — Moving Station" actions=[${MS_OFFLINE}]`)
    console.log(`Repoint campaign ${MS_CAMPAIGN} → new Moving goal`)
    console.log(`Restore ${PACKING_GOAL} → [${packingPrimary.map(a => a.resourceName).join(', ')}]`)

    if (!apply) { console.log('\ndry-run — nothing written.'); process.exit(0) }

    // 1. FIRST restore Packing goal 6457834220 → Packing primary (frees the
    //    [7653142208] action-list so the Moving goal create won't duplicate).
    await mutate(tok, dev, 'customConversionGoals:mutate', { operations: [{ update: { resourceName: PACKING_GOAL, conversionActions: packingPrimary.map(a => a.resourceName) }, updateMask: 'conversionActions' }] })
    console.log(`\nrestored ${PACKING_GOAL} → Packing primary purchase`)

    // 2. create (or reuse) the Moving-only goal [7653142208]
    let movingGoal: string
    try {
        const created = await mutate(tok, dev, 'customConversionGoals:mutate', { operations: [{ create: { name: 'Flowmatic isolated — Moving Station', conversionActions: [MS_OFFLINE] } }] })
        movingGoal = created.results[0].resourceName
        console.log('created Moving goal:', movingGoal)
    } catch (e) {
        if (!/DUPLICATE_CONVERSION_ACTION_LIST/.test((e as Error).message)) throw e
        // reuse existing goal carrying exactly [MS_OFFLINE]
        const goals = await (await fetch(`${ADS}/customers/${OPERATING}/googleAds:searchStream`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'developer-token': dev, 'login-customer-id': LOGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'SELECT custom_conversion_goal.resource_name, custom_conversion_goal.conversion_actions FROM custom_conversion_goal' }) })).json() as any
        const flat: any[] = []; for (const b of (Array.isArray(goals) ? goals : [goals])) for (const x of (b.results || [])) flat.push(x)
        const match = flat.find(g => JSON.stringify((g.customConversionGoal?.conversionActions || []).map(String).sort()) === JSON.stringify([MS_OFFLINE]))
        if (!match) throw e
        movingGoal = match.customConversionGoal.resourceName
        console.log('reused existing Moving goal:', movingGoal)
    }

    // 3. repoint Moving campaign at the Moving goal
    await mutate(tok, dev, 'conversionGoalCampaignConfigs:mutate', { operations: [{ update: { resourceName: `customers/${OPERATING}/conversionGoalCampaignConfigs/${MS_CAMPAIGN}`, goalConfigLevel: 'CAMPAIGN', customConversionGoal: movingGoal }, updateMask: 'goalConfigLevel,customConversionGoal' }] })
    console.log(`repointed campaign ${MS_CAMPAIGN} → Moving goal`)

    console.log('\n✅ split done — verify with ms-check-goals')
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })