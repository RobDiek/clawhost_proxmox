import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
    const [r] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, 'mp_month_a62fa4b60ddd')) as any[]
    const c = r.content
    console.log('typeof content:', typeof c, '| len:', String(c).length)
    console.log('first 300:', String(c).slice(0, 300))
    let obj: any = c
    if (typeof c === 'string') { try { obj = JSON.parse(c) } catch (e) { console.log('PARSE FAIL', (e as Error).message); process.exit(1) } }
    console.log('parsed typeof:', typeof obj, '| top keys:', Object.keys(obj).slice(0, 40).join(','))
    // search for an array of task-like objects
    const visit = (o: any, path: string, depth: number) => {
        if (!o || typeof o !== 'object' || depth > 4) return
        if (Array.isArray(o)) { if (o[0] && (o[0].title || o[0].priority)) console.log(`  TASKS at ${path} (len ${o.length}) sample.title="${o[0].title}"`); return }
        for (const k of Object.keys(o)) visit(o[k], `${path}.${k}`, depth + 1)
    }
    visit(obj, 'root', 0)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })