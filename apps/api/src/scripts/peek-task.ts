import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq, gt } from 'drizzle-orm'
async function main() {
    const since = new Date('2026-06-05T11:00:00Z')
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, 'mta_Un9jXRuf'), eq(agentOutputs.outputType, 'monthly_task'), gt(agentOutputs.createdAt, since))).limit(2) as any[]
    for (const r of rows) {
        console.log('--- row ---')
        console.log('title col:', r.title)
        console.log('status:', r.status)
        console.log('metadata:', JSON.stringify(r.metadata)?.slice(0, 300))
        let c: any = r.content
        console.log('content typeof:', typeof c, 'len', String(c).length)
        if (typeof c === 'string') { try { c = JSON.parse(c) } catch (e) { console.log('parsefail', (e as Error).message); console.log('raw first300:', String(r.content).slice(0,300)); continue } }
        console.log('content keys:', Object.keys(c).join(','))
        console.log('  priority:', c.priority, '| title:', c.title, '| channel:', c.channel, '| category:', c.category)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })