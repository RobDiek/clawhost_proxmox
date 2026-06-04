/** READ-ONLY: find where a tenant's phone/WhatsApp lives across research_data + DB.
 *   node --env-file=.env --import tsx src/scripts/dump-phone.ts <agentId>
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

function walk(obj: any, path: string, hits: string[], depth = 0) {
    if (depth > 5 || obj == null) return
    if (typeof obj === 'string') {
        if (/0\d[\d\-\s]{7,}|\+972|\bwa\.me\b|whatsapp/i.test(obj) && obj.length < 80) hits.push(`${path} = ${obj}`)
        return
    }
    if (typeof obj !== 'object') return
    for (const k of Object.keys(obj)) {
        if (/phone|whats|tel|טלפון|וואטס|נייד|מספר/i.test(k)) hits.push(`KEY ${path}.${k} = ${JSON.stringify(obj[k]).slice(0, 80)}`)
        walk(obj[k], `${path}.${k}`, hits, depth + 1)
    }
}

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rd: any = a?.researchData || {}
    console.log(`\n=== answers keys ===\n${Object.keys(rd.answers || {}).join(', ')}`)
    const hits: string[] = []
    walk(rd, 'rd', hits)
    console.log(`\n=== phone-ish hits (${hits.length}) ===`)
    for (const h of hits.slice(0, 40)) console.log('  ' + h)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })