/** READ-ONLY: show the execution-wave distribution for an agent's monthlyPlan.
 *   node --env-file=.env --import tsx src/scripts/verify-waves.ts [agentId]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { assignWaves, baseWaveForTask, classifyTask, WAVE_LABELS_HE } from '@/services/executorCapabilities'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const tasks: any[] = a?.researchData?.monthlyPlan?.tasks || []
    const waveMap = assignWaves(tasks)
    const byWave: Record<string, number> = { 0: 0, 1: 0, 2: 0 }
    let bumped = 0
    for (const t of tasks) {
        const w = waveMap.get(t.id) ?? 2
        byWave[String(w)]++
        if (w !== baseWaveForTask(t)) bumped++
    }
    console.log(`agent=${agentId} tasks=${tasks.length}`)
    for (const w of [0, 1, 2] as const) console.log(`  ${WAVE_LABELS_HE[w]}: ${byWave[String(w)]}`)
    console.log(`  (dependency-bumped to a later wave: ${bumped})`)
    console.log('\nsample per wave:')
    for (const w of [0, 1, 2] as const) {
        const ex = tasks.filter(t => (waveMap.get(t.id) ?? 2) === w).slice(0, 3)
        for (const t of ex) console.log(`  W${w} [${classifyTask(t).capabilityId}] ${String(t.title).slice(0, 48)}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })