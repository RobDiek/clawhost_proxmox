/** Set up + run offline conversion upload for a tenant (store gclid → Ads).
 * Creates the secondary "Store Orders (offline)" action + watermark=now
 * (so only NEW orders upload), then runs one upload pass.
 *   node --env-file=.env --import tsx src/scripts/apply-offline-upload.ts <agentId> [--dry]
 */
import { runOfflineUploadForAgent } from '@/services/offlineConversionUpload'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const dryRun = process.argv.includes('--dry')
    const sinceArg = process.argv.find(a => a.startsWith('--since='))
    const watermarkOverride = sinceArg ? new Date(sinceArg.split('=')[1]).toISOString() : undefined
    const r = await runOfflineUploadForAgent(agentId, { dryRun, watermarkOverride })
    console.log(`\n=== offline upload (${agentId})${dryRun ? ' DRY-RUN' : ''} ===`)
    console.log(JSON.stringify(r, null, 2))
    process.exit(r.status === 'ok' ? 0 : 1)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })