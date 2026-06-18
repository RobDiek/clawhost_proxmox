/** MS — set conversion roles like PS: offline Store-Orders action = primary,
 *  web-purchase actions = secondary (web loses gclid at Yaad). Then resync the
 *  isolated campaign goal. Dry-run by default; --apply writes.
 *   node --env-file=.env --import tsx src/scripts/ms-conv-roles.ts [--apply]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { listConversionActions, batchSetConversionActionPrimary } from '@/services/mazhirConversions'
import { ensureCampaignGoalIsolation } from '@/services/campaignGoalIsolation'

const AGENT = 'mta_Xm8CfS3K'
const OFFLINE_RES = 'customers/5746845784/conversionActions/7653142208'

async function main() {
    const apply = process.argv.includes('--apply')
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    if (!agent) throw new Error('MS agent not found')
    const cfg: any = agent.googleAdsConfig || {}
    const operating = String(cfg.scope?.operatingCustomerId || cfg.customerId).replace(/\D/g, '')
    const login = String(cfg.customerId || cfg.loginCustomerId).replace(/\D/g, '')
    const dev = cfg.developerToken
    const gt: any = agent.googleTokens || {}
    const tokens = { accessToken: gt.accessToken, refreshToken: gt.refreshToken || gt.refresh_token, expiresAt: gt.expiresAt }

    const all = await listConversionActions(operating, tokens as any, dev, login)
    const brand = 'moving'
    const mine = all.filter(a => (a.name || '').toLowerCase().includes(brand))
    const offline = mine.find(a => a.resourceName === OFFLINE_RES || /offline|store orders/i.test(a.name))
    const webPurchases = mine.filter(a => a.category === 'PURCHASE' && a.resourceName !== offline?.resourceName && !/offline|store orders/i.test(a.name))

    console.log(apply ? '⚙  APPLY\n' : '👀 DRY-RUN\n')
    console.log('offline (→primary):', offline ? `${offline.name} [${offline.resourceName}] primaryNow=${offline.primaryForGoal}` : 'NOT FOUND')
    for (const w of webPurchases) console.log('web purchase (→secondary):', `${w.name} [${w.resourceName}] primaryNow=${w.primaryForGoal}`)

    if (!offline) { console.log('\n⚠ offline action not found — abort'); process.exit(1) }
    const ops = [
        { resourceName: offline.resourceName, primary: true },
        ...webPurchases.map(w => ({ resourceName: w.resourceName, primary: false })),
    ].filter((o, i, arr) => arr.findIndex(x => x.resourceName === o.resourceName) === i)

    if (!apply) { console.log('\nwould batch-set:', JSON.stringify(ops), '\nthen resync goal. dry-run — nothing written.'); process.exit(0) }

    const res = await batchSetConversionActionPrimary(operating, tokens as any, dev, ops, login)
    console.log('\nbatch result:', JSON.stringify(res))

    console.log('\n→ resync isolated goal')
    const iso = await ensureCampaignGoalIsolation(agent as any, { source: 'ms-conv-roles-2026-06-18' })
    console.log('  ', JSON.stringify({ status: iso.status, reason: iso.reason, resyncedGoals: iso.resyncedGoals, customGoalResource: iso.customGoalResource }))

    // verify
    const after = await listConversionActions(operating, tokens as any, dev, login)
    console.log('\nAFTER (MS purchase actions):')
    for (const a of after.filter(x => (x.name || '').toLowerCase().includes(brand) && x.category === 'PURCHASE'))
        console.log(`  • ${a.name} · primary=${a.primaryForGoal}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })