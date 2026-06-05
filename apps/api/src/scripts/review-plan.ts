/** Agent-review the latest saved monthly plan; write metadata.agentReview + print verdicts.
 *   node --env-file=.env --import tsx src/scripts/review-plan.ts <agentId> [--dry]
 */
import { reviewSavedPlanForAgent } from '@/services/monthlyPlanReview'

const ORDER = ['recommend_now', 'propose', 'review_risk', 'needs_integration', 'defer', 'manual']

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const dryRun = process.argv.includes('--dry')
    const r = await reviewSavedPlanForAgent(agentId, { dryRun })
    console.log(`\n=== agent-review (${agentId})${dryRun ? ' DRY' : ''} === status=${r.status} scanned=${r.scanned}`)
    console.log(`byVerdict: ${JSON.stringify(r.byVerdict)}`)
    for (const v of ORDER) {
        const here = (r.reviews || []).filter(x => x.verdict === v)
        if (!here.length) continue
        console.log(`\n##### ${v} (${here.length}) #####`)
        for (const t of here) console.log(`  [${t.priority}/${t.channel}] ${t.title}\n      → ${t.reasonHe}`)
    }
    process.exit(r.status === 'ok' ? 0 : 1)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })