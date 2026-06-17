/** READ-ONLY: inspect Packing research_data keyword/competitor shapes for deriveScope. */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
function keysOf(o: any): string { return o && typeof o === 'object' ? Object.keys(o).join(',') : typeof o }
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const rd: any = a?.researchData || {}
    console.log('rd top keys:', keysOf(rd))
    console.log('rd.answers keys:', keysOf(rd.answers))
    console.log('rd.results keys:', keysOf(rd.results))
    const kr = rd.results?.seo_keyword_research
    console.log('\nseo_keyword_research keys:', keysOf(kr))
    if (kr) for (const k of Object.keys(kr)) { const v = kr[k]; console.log(`  kr.${k}: ${Array.isArray(v) ? 'array['+v.length+'] sample='+JSON.stringify(v[0]).slice(0,120) : keysOf(v)}`) }
    const cl = rd.results?.competitor_landscape
    console.log('\ncompetitor_landscape keys:', keysOf(cl))
    if (cl) for (const k of Object.keys(cl)) { const v = cl[k]; console.log(`  cl.${k}: ${Array.isArray(v) ? 'array['+v.length+'] sample='+JSON.stringify(v[0]).slice(0,120) : keysOf(v)}`) }
    console.log('\naeoPrompts:', Array.isArray(rd.aeoPrompts) ? rd.aeoPrompts.length : 'none', '| seoMonitoring.aeoProbes.prompts:', Array.isArray(rd.seoMonitoring?.aeoProbes?.prompts) ? rd.seoMonitoring.aeoProbes.prompts.length : 'none')
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })