/** READ-ONLY: is Packing's agent connected to GSC + is SEO monitoring running? */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const rd: any = a?.researchData || {}
    const gsc: any = a?.gscTokens || null
    const gt: any = a?.googleTokens || null
    console.log('=== GSC connection ===')
    console.log('gscTokens present:', !!gsc, gsc ? `email=${gsc.email} site=${gsc.siteUrl} sites=${(gsc.sites || []).length}` : '')
    console.log('googleTokens scopes:', gt?.scopes ? JSON.stringify(gt.scopes).slice(0, 200) : '(none)')
    console.log('\n=== seoMonitoring (recurring tracker) ===')
    const sm: any = rd.seoMonitoring || null
    if (!sm) { console.log('seoMonitoring: ABSENT (runner never stored anything for this agent)') }
    else {
        const gd = sm.gscDigest || {}
        console.log('gscDigest.lastRun:', gd.lastRun || '-', '| dailyHistory entries:', (gd.dailyHistory || []).length)
        const last = (gd.dailyHistory || []).slice(-1)[0]
        if (last) console.log('  last digest:', last.date, 'source=', last.source, 'topQueries=', (last.topQueries || []).length, 'topPages=', last.topPagesCount)
        console.log('helpfulContentScore.scoreHistory:', (sm.helpfulContentScore?.scoreHistory || []).length, 'entries')
        console.log('aeoProbes.weeklyHistory:', (sm.aeoProbes?.weeklyHistory || []).length, 'entries')
        console.log('knowledgePanel:', sm.knowledgePanel ? JSON.stringify(sm.knowledgePanel).slice(0, 120) : '-')
    }
    // any keyword rank time-series?
    console.log('\n=== keyword rank time-series? ===')
    console.log('rd.rankTracking:', rd.rankTracking ? 'present' : 'ABSENT')
    console.log('rd.seoMonitoring.rankings:', rd.seoMonitoring?.rankings ? 'present' : 'ABSENT')
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })