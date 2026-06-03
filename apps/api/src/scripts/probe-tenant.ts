/** READ-ONLY: list Mateh agents matching a search term + their setup state.
 *   node --env-file=.env --import tsx src/scripts/probe-tenant.ts <term>
 */
import { db } from '@/db'
import { matehAgents, agentIntegrations } from '@/db/schema'

async function main() {
    const term = (process.argv[2] || 'moving').toLowerCase()
    const all = await db.select().from(matehAgents)
    const ints = await db.select().from(agentIntegrations)
    const hits = all.filter(a => {
        const rd: any = a.researchData || {}
        const hay = [a.id, a.name, rd.answers?.businessName, rd.answers?.website, rd.mazhirGtm?.target?.name, a.vpsInstanceId].join(' ').toLowerCase()
        return hay.includes(term)
    })
    console.log(`\n=== agents matching "${term}": ${hits.length} ===`)
    for (const a of hits) {
        const rd: any = a.researchData || {}
        const ai = ints.filter(i => i.agentId === a.id)
        console.log(`\n• ${a.id}  (${a.name || '—'})  instance=${a.vpsInstanceId} primary=${(a as any).isPrimary}`)
        console.log(`  business: ${rd.answers?.businessName || '—'} | site: ${rd.answers?.website || '—'}`)
        console.log(`  googleTokens: ${a.googleTokens ? 'yes (' + ((a.googleTokens as any).email || '?') + ')' : 'NO'}`)
        const ads: any = a.googleAdsConfig || {}
        console.log(`  googleAdsConfig: ${ads.customerId ? `mgr=${ads.customerId} op=${ads.scope?.operatingCustomerId || ads.mccSubAccountId || '?'} dev=${ads.developerToken ? 'yes' : 'NO'}` : 'NO'}`)
        console.log(`  mazhirGtm.target: ${rd.mazhirGtm?.target ? `${rd.mazhirGtm.target.name} (acct ${rd.mazhirGtm.target.accountId}/cont ${rd.mazhirGtm.target.containerId}) mid=${rd.mazhirGtm.target.measurementId || '—'}` : 'NOT PICKED'}`)
        console.log(`  mazhirConversions: ${rd.mazhirConversions ? `active=${(rd.mazhirConversions.active || []).length} gtmConfigs=${(rd.mazhirConversions.gtmConfigs || []).length} src=${rd.mazhirConversions.source || '?'}` : 'none'}`)
        console.log(`  serverSideTracking: ${rd.serverSideTracking?.ga4ApiSecret ? 'configured' : 'no'}`)
        console.log(`  offlineConversions: ${rd.offlineConversions?.actionResourceName ? `action set, watermark=${rd.offlineConversions.watermark}` : 'NOT provisioned'}`)
        console.log(`  integrations: ${ai.map(i => i.integrationType).join(', ') || 'none'}`)
        console.log(`  setupState: ${rd.tenantSetupState || rd.setupState || '?'}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })