/** READ-ONLY: dump detectExistingConversionActions classification for an agent —
 * shows primaryForGoal / includeInConversionsMetric / brandAffinity per action,
 * so we can see which actions WOULD go into the isolated custom goal. No writes.
 *   node --env-file=.env --import tsx src/scripts/verify-detect-conv.ts [agentId]
 */
import { detectExistingConversionActions } from '@/services/mazhirConversionsDetect'

async function main() {
    const instanceId = '44f484a852', agentId = process.argv[2] || 'mta_Un9jXRuf'
    const det: any = await detectExistingConversionActions(instanceId, agentId)
    if (det?.error) { console.log('ERROR:', det.error); process.exit(1) }
    const cands: any[] = det.candidates || []
    console.log(`candidates: ${cands.length}\n`)
    // What applyIsolation would put in the goal: primary && includeInConversionsMetric && affinity != sibling
    const wouldInclude = (c: any) => c.primaryForGoal && c.includeInConversionsMetric && c.brandAffinity !== 'sibling'
    for (const c of cands) {
        const id = String(c.adsResourceName || '').split('/').pop()
        const flag = wouldInclude(c) ? '★ IN-GOAL' : '         '
        console.log(`  ${flag} [${c.brandAffinity}] P=${c.primaryForGoal ? 'Y' : 'n'} inConv=${c.includeInConversionsMetric ? 'Y' : 'n'} cat=${c.category || '?'} "${String(c.name).slice(0, 45)}" (${id})`)
    }
    console.log(`\n=== would be isolated into goal (primary+inConv+not-sibling): ===`)
    for (const c of cands.filter(wouldInclude)) console.log(`  ${String(c.adsResourceName).split('/').pop()} "${c.name}"`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })