/** READ-ONLY: did link_audit run with real DFS backlinks data, and do link tasks
 * carry target-page / anchor / cost / sequence? Assess the external-link layer.
 *   node --env-file=.env --import tsx src/scripts/inspect-link-audit.ts [agentId]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const rd: any = a?.researchData || {}
    const la = rd?.results?.link_audit
    console.log('=== link_audit stage result ===')
    console.log('present:', !!la, '· keys:', la ? Object.keys(la).join(', ') : '-')
    if (la) {
        console.log('backlinksApiAvailable:', la.backlinksApiAvailable ?? la.dfs?.backlinksApiAvailable)
        console.log('records:', Array.isArray(la.records) ? la.records.length : (la.records ? 'obj' : 'none'))
        const r0 = Array.isArray(la.records) ? la.records[0] : null
        if (r0) console.log('record[0] keys:', Object.keys(r0).join(', '))
        if (r0) console.log('record[0] sample:', JSON.stringify(r0).slice(0, 400))
    }
    // chosen scenario (strategy alignment)
    console.log('\nchosenScenario:', JSON.stringify(rd.chosenScenario || rd.results?.strategy_options?.chosenScenario || 'none').slice(0, 200))

    // link tasks
    const tasks: any[] = rd?.monthlyPlan?.tasks || []
    const linkTasks = tasks.filter(t => /קישור|outreach|backlink|citation|link|עוגן|פניית/i.test(`${t.title} ${t.summary}`))
    console.log(`\n=== link/outreach tasks: ${linkTasks.length} ===`)
    for (const t of linkTasks.slice(0, 8)) {
        console.log(`\n• "${String(t.title).slice(0, 60)}"`)
        console.log(`  channel=${t.channel} priority=${t.priority} effort=${t.estimatedEffort} cost=${t.estimatedCostIls ?? t.costIls ?? '—'}`)
        console.log(`  fields: ${Object.keys(t).join(', ')}`)
        const ap = (t.actionPlan || []).map((s: any) => s.step).join(' | ')
        console.log(`  summary: ${String(t.summary || '').slice(0, 150)}`)
        if (ap) console.log(`  actionPlan: ${ap.slice(0, 200)}`)
        console.log(`  targetUrl=${t.targetUrl || t.targetPage || '—'} anchor=${t.anchor || t.anchorKeyword || '—'}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })