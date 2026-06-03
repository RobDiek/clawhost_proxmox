/** Apply the (updated) GTM auto-setup to a tenant — adds the new
 * click-to-contact (WhatsApp/phone) tags idempotently + publishes.
 * Mirrors controllers/hosting/agentSetup.ts:autoSetupMazhirGtm.
 *   node --env-file=.env --import tsx src/scripts/apply-gtm-clicks.ts <instanceId> <agentId>
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { autoSetupGtmContainer, saveGtmSetupResult } from '@/services/mazhirGtmSetup'

async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const agentId = process.argv[3] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    if (!a) throw new Error(`agent ${agentId} not found`)
    const rd: any = a.researchData || {}
    const googleTokens = a.googleTokens as any
    if (!googleTokens) throw new Error('Google not connected')
    const target = rd.mazhirGtm?.target
    if (!target) throw new Error('GTM target not picked')
    const profile = rd.paidProfile

    let gtmConfigs: any[] = rd.mazhirConversions?.gtmConfigs || []
    if (!Array.isArray(gtmConfigs) || gtmConfigs.length === 0) {
        const conversions = rd.mazhirConversions?.active || rd.mazhirConversions?.created || []
        gtmConfigs = conversions
            .filter((cv: any) => cv.source ? cv.source === 'created' : true)
            .filter((cv: any) => cv.googleAdsConversionId && cv.googleAdsConversionLabel)
            .filter((cv: any) => cv.actionKey !== 'qualified_lead' && cv.actionKey !== 'phone_call_offline')
            .map((cv: any) => ({
                actionKey: cv.actionKey === 'form_submit' ? 'generate_lead' : cv.actionKey,
                googleAdsConversionId: cv.googleAdsConversionId,
                googleAdsConversionLabel: cv.googleAdsConversionLabel,
                sendValue: true,
                defaultValueIls: profile?.avgDealValueIls || 100,
                defaultCurrency: 'ILS',
            }))
    }

    console.log(`\n=== Applying GTM setup: ${target.name} (acct ${target.accountId}/cont ${target.containerId}) — ${gtmConfigs.length} conv configs ===\n`)
    const result = await autoSetupGtmContainer(googleTokens, {
        target,
        measurementId: target.measurementId,
        conversions: gtmConfigs,
        enhancedConversions: true,
    })
    await saveGtmSetupResult(instanceId, result, a.id)

    console.log('published:', result.published, '| version:', result.versionId, result.noopReason ? `| noop: ${result.noopReason}` : '')
    console.log('\nCREATED:'); for (const x of result.created) console.log(`  + ${x.type} "${x.name}" (${x.id})`)
    console.log('\nSKIPPED:'); for (const x of result.skipped) console.log(`  - ${x.type} "${x.name}": ${x.reason}`)
    if (result.errors.length) { console.log('\nERRORS:'); for (const x of result.errors) console.log(`  ! ${x.step}: ${x.error}`) }
    process.exit(result.errors.length && !result.published ? 1 : 0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })