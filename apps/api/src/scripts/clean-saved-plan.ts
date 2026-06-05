/** Run Hebrew cleanup on the latest SAVED monthly plan's per-task rows.
 *   node --env-file=.env --import tsx src/scripts/clean-saved-plan.ts <agentId> [--dry]
 */
import { runSavedPlanHebrewCleanup } from '@/services/monthlyPlanCleanupSaved'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const dryRun = process.argv.includes('--dry')
    const r = await runSavedPlanHebrewCleanup(agentId, { dryRun })
    console.log(`\n=== saved-plan cleanup (${agentId})${dryRun ? ' DRY' : ''} ===`)
    console.log(`status=${r.status} scanned=${r.scanned} updated=${r.updated} reason=${r.reason || '—'}`)
    for (const s of r.samples || []) { console.log(`\n  BEFORE: ${s.before}`); console.log(`  AFTER : ${s.after}`) }
    process.exit(r.status === 'ok' ? 0 : 1)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })