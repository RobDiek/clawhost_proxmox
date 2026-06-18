/** Read-only: what did the SYSTEM surface in the MS agent's cabinet? All
 *  agent_outputs (tasks) + research_data state markers — to compare against
 *  what we fixed manually this session.
 *   node --env-file=.env --import tsx src/scripts/dump-ms-cabinet.ts
 */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

const AGENT = 'mta_Xm8CfS3K'

async function main() {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    const rd: any = a!.researchData || {}

    console.log('═══ ALL agent_outputs (cabinet tasks) for MS ═══')
    const outs = await db.select().from(agentOutputs).where(eq(agentOutputs.agentId, AGENT)).orderBy(desc(agentOutputs.createdAt))
    if (!outs.length) console.log('  (NONE)')
    for (const o of outs) {
        console.log(`  [${o.status}] ${o.outputType} · "${(o.title || '').slice(0, 70)}" · ${o.createdAt?.toISOString?.() || o.createdAt}`)
        const meta: any = o.metadata || {}
        if (meta.liveApiStatus) console.log(`        liveApiStatus=${meta.liveApiStatus}`)
    }

    console.log('\n═══ research_data state markers ═══')
    const keys = ['mazhirGtm', 'offlineConversions', 'mazhirConversions', 'foundationPlan', 'adsRecommendations', 'biddingObjective', 'onboardingComplete', 'setupState', 'trackingHealth', 'paidProfile']
    for (const k of keys) {
        const v = rd[k]
        const summary = v == null ? '—' : typeof v === 'object'
            ? (k === 'mazhirGtm' ? `target.mid=${v.target?.measurementId || '∅'} setupResult=${v.lastSetupResult ? 'yes' : 'no'}`
                : k === 'offlineConversions' ? `action=${v.actionResourceName ? 'set' : '∅'}`
                    : k === 'foundationPlan' ? `deltas=${v.deltaCount}`
                        : 'present')
            : String(v).slice(0, 40)
        console.log(`  ${k.padEnd(20)} ${summary}`)
    }

    // onboarding / setup completion signals
    console.log('\n═══ onboarding/setup signals ═══')
    console.log('  agent.setupCompletedAt:', (a as any).setupCompletedAt || '—')
    console.log('  agent.status:', (a as any).status || '—')
    console.log('  research_data.answers.businessName:', rd.answers?.businessName || '—')
    console.log('  research_data.gtmSetupRanAt:', rd.mazhirGtm?.lastSetupAt || rd.gtmSetupRanAt || '—')

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })