/** Read-only: dump every mateh_agent's name + Google Ads scope on an instance.
 *   node --env-file=.env --import tsx src/scripts/check-agent-scopes.ts [instanceId]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const rows = await db.select().from(matehAgents).where(eq(matehAgents.vpsInstanceId, instanceId))
    for (const a of rows) {
        const cfg: any = a.googleAdsConfig || {}
        const rd: any = a.researchData || {}
        console.log('—'.repeat(60))
        console.log(`agent ${a.id}  name="${a.name}"`)
        console.log(`  website: ${rd.answers?.websiteUrl || rd.paidProfile?.websiteUrl || '—'}`)
        console.log(`  customerId(login): ${cfg.customerId || '—'}  operating: ${cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || '—'}`)
        console.log(`  scope.mode: ${cfg.scope?.mode || '—'}  campaignIds: ${JSON.stringify(cfg.scope?.campaignIds || [])}`)
        console.log(`  developerToken: ${cfg.developerToken ? '<set>' : '—'}  refreshToken: ${(a.googleTokens as any)?.refreshToken ? '<set>' : '—'}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })