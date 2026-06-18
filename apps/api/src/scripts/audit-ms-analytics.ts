/** Read-only audit of MS (Moving Station) analytics stack vs siblings.
 *   node --env-file=.env --import tsx src/scripts/audit-ms-analytics.ts [agentId]
 * Default agent = Moving Station (mta_Xm8CfS3K). No writes.
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runTrackingHealthCheck } from '@/services/trackingHealthCheck'
import { detectExistingConversionActions } from '@/services/mazhirConversionsDetect'

const INSTANCE = '44f484a852'

function tokenAge(exp?: number): string {
    if (!exp) return '—'
    const d = exp - Date.now()
    return d > 0 ? `valid ${Math.round(d / 3600000)}h` : `EXPIRED ${Math.round(-d / 3600000)}h ago`
}

async function main() {
    const agentId = process.argv[2] || 'mta_Xm8CfS3K'

    // 1. OAuth identity + isolation across ALL agents (did MS onboarding revoke a sibling?)
    console.log('═══ GOOGLE OAUTH IDENTITY / ISOLATION (all agents) ═══')
    const all = await db.select().from(matehAgents).where(eq(matehAgents.vpsInstanceId, INSTANCE))
    for (const a of all) {
        const gt: any = a.googleTokens || {}
        const scopes: string[] = gt.scopes || []
        const short = scopes.map(s => s.replace('https://www.googleapis.com/auth/', '')).join(', ')
        console.log(`— ${a.name} (${a.id})`)
        console.log(`    email: ${gt.email || '—'}  refresh: ${gt.refreshToken || gt.refresh_token ? '<set>' : 'MISSING'}  access: ${tokenAge(gt.expiresAt)}`)
        console.log(`    scopes: ${short || '—'}`)
    }

    // 2. MS-specific config
    const [ms] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    if (!ms) { console.log(`\nagent ${agentId} not found`); process.exit(1) }
    const rd: any = ms.researchData || {}
    const cfg: any = ms.googleAdsConfig || {}
    console.log(`\n═══ MS CONFIG (${ms.name} / ${agentId}) ═══`)
    console.log(`  website: ${rd.answers?.websiteUrl || rd.paidProfile?.websiteUrl || '—'}`)
    console.log(`  Ads: customerId(login)=${cfg.customerId || '—'} operating=${cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || '—'} campaigns=${JSON.stringify(cfg.scope?.campaignIds || [])} dev=${cfg.developerToken ? '<set>' : '—'}`)
    console.log(`  GTM (rd.mazhirGtm): ${rd.mazhirGtm ? JSON.stringify({ containerId: rd.mazhirGtm.target?.containerId, gtmId: rd.mazhirGtm.target?.gtmId, measurementId: rd.mazhirGtm.target?.measurementId, published: rd.mazhirGtm.published }) : '— NOT CONFIGURED'}`)
    console.log(`  GA4 measurementId: ${rd.mazhirGtm?.target?.measurementId || '—'}`)
    console.log(`  GSC (rd.gscConfig/siteUrl): ${rd.gscConfig?.siteUrl || rd.gscSiteUrl || '—'}`)
    console.log(`  offlineConversions: ${rd.offlineConversions?.actionResourceName ? `action=${rd.offlineConversions.actionResourceName} lastUploaded=${rd.offlineConversions.lastUploaded ?? '—'}` : '— NOT SET'}`)
    console.log(`  conv_value_quality_subscore: ${rd.results?.client_account_baseline?.extras?.conv_value_quality_subscore_0_100 ?? '—'}`)

    // 3. Tracking health
    console.log(`\n═══ TRACKING HEALTH (MS) ═══`)
    try {
        const h = await runTrackingHealthCheck(INSTANCE, agentId)
        console.log(`  score: ${h.score}/100`)
        for (const c of h.checks) console.log(`  ${c.status === 'pass' ? '✅' : c.status === 'warn' ? '🟡' : c.status === 'skip' ? '⚪' : '🔴'} [${c.id}] ${c.he}${c.fix ? `\n        ↳ fix: ${c.fix}` : ''}`)
    } catch (e) { console.log(`  health check failed: ${(e as Error).message}`) }

    // 4. Conversion actions (MS) — brand affinity classification
    console.log(`\n═══ CONVERSION ACTIONS (MS) ═══`)
    try {
        const det: any = await detectExistingConversionActions(INSTANCE, agentId)
        if (det?.error) console.log(`  detect failed: ${det.error}`)
        else for (const c of (det.candidates || [])) {
            console.log(`  • ${c.name} · cat=${c.category} · primary=${c.primaryForGoal} · inConv=${c.includeInConversionsMetric} · affinity=${c.brandAffinity}`)
        }
    } catch (e) { console.log(`  conversion detect failed: ${(e as Error).message}`) }

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })