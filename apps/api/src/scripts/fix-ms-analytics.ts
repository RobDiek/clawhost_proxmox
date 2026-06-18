/** Fix MS (Moving Station) analytics — Stage A (config only, reversible).
 *   node --env-file=.env --import tsx src/scripts/fix-ms-analytics.ts [--apply]
 *
 * Stage A:
 *   A1. wire GA4 measurementId G-JS48GDEL9H into rd.mazhirGtm.target
 *   A2. fix Ads login-customer-id: customerId 5746845784 → 5898711892 (MCC),
 *       preserving scope.operatingCustomerId=5746845784 + campaignIds.
 * Dry-run prints current state; --apply writes. No GTM/Ads/site writes here.
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { writeGoogleAdsConfig, mutateResearchData } from '@/services/agentContext'

const AGENT = 'mta_Xm8CfS3K', INSTANCE = '44f484a852'
const GA4_MID = 'G-JS48GDEL9H'
const MCC_LOGIN = '5898711892', OPERATING = '5746845784', CAMPAIGN = '23066805751'

async function main() {
    const apply = process.argv.includes('--apply')
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    if (!agent) throw new Error('MS agent not found')
    const rd: any = agent.researchData || {}
    const cfg: any = agent.googleAdsConfig || {}

    console.log(apply ? '⚙  APPLY\n' : '👀 DRY-RUN (--apply to write)\n')
    console.log('— current mazhirGtm.target:', JSON.stringify(rd.mazhirGtm?.target || null))
    console.log('— current googleAdsConfig:', JSON.stringify({ customerId: cfg.customerId, loginCustomerId: cfg.loginCustomerId, scope: cfg.scope, dev: cfg.developerToken ? '<set>' : '—' }))
    console.log('')
    console.log(`A1 → mazhirGtm.target.measurementId = ${GA4_MID} (was ${rd.mazhirGtm?.target?.measurementId || 'EMPTY'})`)
    console.log(`A2 → googleAdsConfig.customerId/login = ${MCC_LOGIN} (was ${cfg.customerId}); scope.operatingCustomerId=${OPERATING} campaignIds=[${CAMPAIGN}]`)

    if (!apply) { console.log('\ndry-run — nothing written.'); process.exit(0) }

    // A1 — measurementId into mazhirGtm.target
    await mutateResearchData(agent as any, INSTANCE, (cur: any) => {
        const c = cur || {}
        c.mazhirGtm = c.mazhirGtm || {}
        c.mazhirGtm.target = { ...(c.mazhirGtm.target || {}), measurementId: GA4_MID }
        return c
    })

    // A2 — Ads login-customer-id (preserve operating + campaigns + dev)
    const nextCfg = {
        ...cfg,
        customerId: MCC_LOGIN,
        loginCustomerId: MCC_LOGIN,
        scope: { ...(cfg.scope || {}), mode: 'campaigns', operatingCustomerId: OPERATING, campaignIds: [CAMPAIGN] },
    }
    await writeGoogleAdsConfig(agent as any, INSTANCE, { config: nextCfg })

    const [after] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    const ard: any = after?.researchData || {}, acfg: any = after?.googleAdsConfig || {}
    console.log('\n✅ written')
    console.log('  mazhirGtm.target.measurementId:', ard.mazhirGtm?.target?.measurementId)
    console.log('  googleAdsConfig:', JSON.stringify({ customerId: acfg.customerId, loginCustomerId: acfg.loginCustomerId, operating: acfg.scope?.operatingCustomerId, campaigns: acfg.scope?.campaignIds }))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })