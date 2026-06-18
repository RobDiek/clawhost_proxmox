/** P3 — generate the ads_foundation_review approval task for an agent.
 *   node --env-file=.env --import tsx src/scripts/foundation-task.ts [agentId] [--create] [--force]
 * Without --create: dry-run (reports delta count, writes nothing). With --create:
 * inserts the pending_review task + sends Telegram. NO Google Ads writes (that's
 * only on approval).
 */
import { runFoundationForAgent } from '@/services/foundationTaskGenerator'

async function main() {
    const agentId = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'mta_Un9jXRuf'
    const createTask = process.argv.includes('--create')
    const force = process.argv.includes('--force')
    console.error(`[foundation-task] ${agentId} createTask=${createTask} force=${force} …`)
    const r = await runFoundationForAgent(agentId, { createTask, force })
    console.log(JSON.stringify(r, null, 2))
    process.exit(r.ok ? 0 : 1)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })