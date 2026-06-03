/** READ-ONLY: run the systemic tracking-health check for a tenant agent.
 *   npx tsx src/scripts/test-tracking-health.ts <instanceId> <agentId>
 */
import { runTrackingHealthCheck } from '@/services/trackingHealthCheck'
async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const agentId = process.argv[3] || 'mta_Un9jXRuf'
    const r = await runTrackingHealthCheck(instanceId, agentId)
    console.log(`\n===== TRACKING HEALTH: ${r.business} (${r.agentId}) — score ${r.score}/100 =====\n`)
    const icon = (s: string) => s === 'pass' ? '✅' : s === 'warn' ? '🟡' : s === 'fail' ? '🔴' : '⚪'
    for (const c of r.checks) {
        console.log(`${icon(c.status)} [${c.id}] ${c.he}`)
        if (c.fix) console.log(`     → ${c.fix}`)
    }
    console.log('')
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })