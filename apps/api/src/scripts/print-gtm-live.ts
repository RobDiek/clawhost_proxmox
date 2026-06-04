/** READ-ONLY: list tags/triggers in the LIVE published GTM version for an agent's
 * container — to confirm the click-capture + whatsapp_click tags are actually live.
 *   node --env-file=.env --import tsx src/scripts/print-gtm-live.ts <agentId>
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

const GTM = 'https://tagmanager.googleapis.com/tagmanager/v2'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

async function main() {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, process.argv[2] || 'mta_Un9jXRuf'))
    const t: any = (a?.researchData as any)?.mazhirGtm?.target || {}
    const rt = (a?.googleTokens as any)?.refreshToken || (a?.googleTokens as any)?.refresh_token
    const tr = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
    const at = ((await tr.json()) as any).access_token
    const path = `/accounts/${t.accountId}/containers/${t.containerId}/versions:live`
    const r = await fetch(`${GTM}${path}`, { headers: { Authorization: `Bearer ${at}` } })
    const v = await r.json() as any
    if (!r.ok) { console.log('LIVE fetch', r.status, JSON.stringify(v).slice(0, 300)); process.exit(1) }
    console.log(`LIVE version: ${v.containerVersionId} · name="${v.name || ''}"`)
    const tags = v.tag || [], trigs = v.trigger || []
    console.log(`\nTAGS (${tags.length}):`)
    for (const tg of tags) console.log(`  [${tg.type}] ${tg.name}`)
    console.log(`\nTRIGGERS (${trigs.length}):`)
    for (const tr2 of trigs) console.log(`  [${tr2.type}] ${tr2.name}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })