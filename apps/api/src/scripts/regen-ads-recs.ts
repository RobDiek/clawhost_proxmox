/** Archive the existing ads_recommendations_review task + re-run the evaluator
 * so the new task carries content.displayHe (human-readable).
 *   node --env-file=.env --import tsx src/scripts/regen-ads-recs.ts <agentId>
 */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { runEvaluatorForAgent } from '@/services/adsRecommendationsEvaluator'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const old = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'ads_recommendations_review'), eq(agentOutputs.status, 'pending_review'))) as any[]
    for (const r of old) await db.update(agentOutputs).set({ status: 'archived', updatedAt: new Date() }).where(eq(agentOutputs.id, r.id))
    console.log(`archived ${old.length} old ads-recs task(s)`)
    const r = await runEvaluatorForAgent(agentId, { createTask: true })
    console.log(`evaluator: ok=${r.ok} taskId=${r.taskId} summary=${JSON.stringify(r.summary)} err=${r.error || '-'}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })