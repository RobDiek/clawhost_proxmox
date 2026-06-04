/** Regenerate a tenant's monthly plan (multi-pass) + print coverage.
 *   node --env-file=.env --import tsx src/scripts/regen-plan.ts <instanceId> <agentId>
 */
import { generateMonthlyPlan } from '@/services/monthlyPlanGenerator'
import { computePlanCoverage } from '@/services/executorCapabilities'

async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const agentId = process.argv[3] || 'mta_Un9jXRuf'
    console.log(`[regen] starting for ${instanceId}/${agentId} …`)
    const t0 = Date.now()
    const r = await generateMonthlyPlan(instanceId, 'on_demand', agentId)
    const tasks = r.monthlyPlan.tasks || []
    const cov = computePlanCoverage(tasks as any)
    console.log(`\n[regen] DONE in ${((Date.now() - t0) / 1000).toFixed(0)}s · tasks=${tasks.length} · outputId=${r.outputId} · model=${r.cost?.model}`)
    console.log(`[regen] coverage: autoPct=${cov.autoPct}% · ${JSON.stringify(cov.byAutonomy)}`)
    console.log(`[regen] byCapability: ${JSON.stringify(cov.byCapability)}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })