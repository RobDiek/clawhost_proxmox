/** Dry-run the page-refresh adapter on a tenant (no WP writes).
 *   node --env-file=.env --import tsx src/scripts/test-page-refresh.ts <instanceId> <agentId> [targetWords]
 */
import { runPageRefresh } from '@/services/seoPageRefresh'

async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const agentId = process.argv[3] || 'mta_Un9jXRuf'
    const targetWords = process.argv[4] ? parseInt(process.argv[4], 10) : undefined
    const r = await runPageRefresh(instanceId, { agentId, targetWords, dryRun: true })
    console.log(`\n=== page-refresh DRY-RUN (${agentId}) ===`)
    console.log(`  integrationMissing=${r.integrationMissing} authError=${r.authError} error=${r.error || '—'}`)
    console.log(`  scanned=${r.scanned} · candidates(thin)=${r.candidates} · targetWords=${r.targetWords}`)
    console.log(`  WOULD update ${r.updated.length}:`)
    for (const u of r.updated) console.log(`    + ${u.title} · ${u.beforeWords}→${u.afterWords} words · ${u.link}`)
    if (r.failures.length) { console.log(`  failures ${r.failures.length}:`); for (const f of r.failures) console.log(`    ! ${f.type} #${f.id}: ${f.error}`) }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })