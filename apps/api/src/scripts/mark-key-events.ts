/** Mark lead events as GA4 Key Events (conversions) for a tenant.
 *   node --env-file=.env --import tsx src/scripts/mark-key-events.ts <agentId> [property]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ensureKeyEvent, listKeyEvents } from '@/services/ga4Admin'

async function main() {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, process.argv[2] || 'mta_Un9jXRuf'))
    const gt: any = a?.googleTokens || {}
    const tokens = { accessToken: gt.accessToken, refreshToken: gt.refreshToken || gt.refresh_token, expiresAt: gt.expiresAt }
    const property = process.argv[3] || '506729603'
    for (const ev of ['whatsapp_click', 'phone_call']) {
        try { const r = await ensureKeyEvent(tokens as any, property, ev); console.log(`${r.created ? '✓ created' : '· exists'} key event: ${ev} (${r.name})`) }
        catch (e) { console.log(`✗ ${ev}: ${(e as Error).message}`) }
    }
    console.log('\n=== current key events ===')
    const all = await listKeyEvents(tokens as any, property)
    for (const ke of all) console.log(`  ${ke.eventName}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })