/** READ-ONLY: dump an execution output row's result. */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
    const id = process.argv[2] || 'mt_b2dcb8bb10d1'
    const [r] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, id)) as any[]
    if (!r) { console.log('not found:', id); process.exit(0) }
    console.log('outputType:', r.outputType, '| status:', r.status, '| created:', r.createdAt)
    let c: any = r.content
    if (typeof c === 'string') { try { c = JSON.parse(c) } catch { /**/ } }
    if (typeof c === 'object' && c) {
        console.log('keys:', Object.keys(c).join(','))
        if (c.updated) console.log('updated count:', Array.isArray(c.updated) ? c.updated.length : c.updated)
        if (c.outputDescription) console.log('outputDescription:', c.outputDescription)
        if (c.summary) console.log('summary:', JSON.stringify(c.summary).slice(0, 200))
        console.log('full (600):', JSON.stringify(c).slice(0, 600))
    } else {
        console.log('content (400):', String(c).slice(0, 400))
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })