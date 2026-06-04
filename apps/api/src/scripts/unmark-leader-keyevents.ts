/** (A) Un-mark Leader's WhatsApp/call key events so only our whatsapp_click /
 * phone_call count (no double-count on Ads import). Reversible.
 *   node --env-file=.env --import tsx src/scripts/unmark-leader-keyevents.ts <agentId> [property]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { listKeyEvents, deleteKeyEvent } from '@/services/ga4Admin'

const REMOVE = ['WhatsApp from Leader', 'Phone_call_from_Leader_GA4']

async function main() {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, process.argv[2] || 'mta_Un9jXRuf'))
    const gt: any = a?.googleTokens || {}
    const tokens = { accessToken: gt.accessToken, refreshToken: gt.refreshToken || gt.refresh_token, expiresAt: gt.expiresAt }
    const property = process.argv[3] || '506729603'
    const all = await listKeyEvents(tokens as any, property)
    for (const name of REMOVE) {
        const ke = all.find(k => (k.eventName || '') === name)
        if (!ke) { console.log(`· not a key event (skip): ${name}`); continue }
        try { await deleteKeyEvent(tokens as any, ke.name); console.log(`✓ un-marked Leader key event: ${name}`) }
        catch (e) { console.log(`✗ ${name}: ${(e as Error).message}`) }
    }
    console.log('\n=== remaining key events ===')
    for (const ke of await listKeyEvents(tokens as any, property)) console.log(`  ${ke.eventName}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })