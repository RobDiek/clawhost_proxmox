/** Dry-run site_widget on a tenant (no write).
 *   node --env-file=.env --import tsx src/scripts/test-site-widget.ts <instanceId> <agentId> <buttons|popup>
 */
import { runSiteWidget } from '@/services/seoSiteWidget'
async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const agentId = process.argv[3] || 'mta_Un9jXRuf'
    const mode = (process.argv[4] as 'buttons' | 'popup') || 'buttons'
    const r = await runSiteWidget(instanceId, { agentId, mode, taskText: 'קופון 5%', dryRun: true })
    console.log(`\n=== site_widget DRY-RUN (${mode}) ===`)
    console.log(JSON.stringify(r, null, 2))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })