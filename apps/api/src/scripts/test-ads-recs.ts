/** Evaluate Google Ads recommendations for a tenant (read-only by default).
 *   node --env-file=.env --import tsx src/scripts/test-ads-recs.ts <agentId> [--task]
 */
import { runEvaluatorForAgent } from '@/services/adsRecommendationsEvaluator'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const createTask = process.argv.includes('--task')
    const r = await runEvaluatorForAgent(agentId, { createTask })
    console.log(`\n=== Ads Recommendations Evaluator (${agentId})${createTask ? ' +task' : ' read-only'} ===`)
    console.log(`ok=${r.ok}${r.error ? ` error=${r.error}` : ''}`)
    console.log(`maturity: mature=${r.maturity.mature} · ${r.maturity.reason}`)
    console.log(`summary: ${JSON.stringify(r.summary)}${r.taskId ? ` · taskId=${r.taskId}` : ''}`)
    console.log('\nverdicts:')
    for (const v of r.verdicts) {
        const imp = `conv ${v.impact.conversions ?? 0} · ₪val ${v.impact.convValue ?? 0} · ₪cost ${v.impact.costIls ?? 0}`
        console.log(`  ${v.verdict.toUpperCase().padEnd(7)} [${v.category}] ${v.type}  (${imp})`)
        console.log(`     ${v.reason}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })