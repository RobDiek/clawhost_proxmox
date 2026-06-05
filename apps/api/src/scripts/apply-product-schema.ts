/** Build + write Product+Offer JSON-LD to WooCommerce product pages (real WC data).
 *   node --env-file=.env --import tsx src/scripts/apply-product-schema.ts <agentId> [--dry]
 */
import { runProductSchemaForAgent } from '@/services/seoProductSchema'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const dryRun = process.argv.includes('--dry')
    const r = await runProductSchemaForAgent(agentId, { dryRun })
    console.log(`\n=== product-schema (${agentId})${dryRun ? ' DRY' : ''} ===`)
    console.log(`status=${r.status} scanned=${r.scanned} updated=${r.updated} skipped=${r.skipped} failures=${r.failures} reason=${r.reason || '-'}`)
    for (const s of r.samples || []) console.log(`  #${s.id} "${s.name}" ₪${s.price} · ${s.availability}${s.hasRating ? ' · rating' : ''}`)
    for (const e of r.errors || []) console.log(`  err: ${e}`)
    process.exit(r.status === 'ok' ? 0 : 1)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })