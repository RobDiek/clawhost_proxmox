/** READ-ONLY: GA4 realtime event counts (last ~30 min) for an agent's property.
 *   node --env-file=.env --import tsx src/scripts/ga4-realtime.ts <agentId>
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
const TOKEN_URL = 'https://oauth2.googleapis.com/token', ADMIN = 'https://analyticsadmin.googleapis.com/v1beta', DATA = 'https://analyticsdata.googleapis.com/v1beta'
async function main() {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, process.argv[2] || 'mta_Un9jXRuf'))
    const mid = (a?.researchData as any)?.mazhirGtm?.target?.measurementId
    const rt = (a?.googleTokens as any)?.refreshToken || (a?.googleTokens as any)?.refresh_token
    const tr = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
    const at = ((await tr.json()) as any).access_token
    // resolve property
    const sj = await (await fetch(`${ADMIN}/accountSummaries?pageSize=200`, { headers: { Authorization: `Bearer ${at}` } })).json() as any
    let prop = ''
    for (const ac of sj.accountSummaries || []) for (const p of ac.propertySummaries || []) {
        const dj = await (await fetch(`${ADMIN}/${p.property}/dataStreams?pageSize=50`, { headers: { Authorization: `Bearer ${at}` } })).json() as any
        for (const s of dj.dataStreams || []) if (s.webStreamData?.measurementId === mid) prop = p.property.replace('properties/', '')
    }
    console.log(`property ${prop} (mid ${mid})`)
    const r = await fetch(`${DATA}/properties/${prop}:runRealtimeReport`, { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }] }) })
    const j = await r.json() as any
    if (!r.ok) { console.log('realtime err', r.status, JSON.stringify(j).slice(0, 300)); process.exit(1) }
    console.log('\n=== GA4 REALTIME events (last ~30 min) ===')
    const rows = (j.rows || []).map((x: any) => ({ e: x.dimensionValues[0].value, n: x.metricValues[0].value }))
    if (!rows.length) console.log('  (no realtime events)')
    for (const x of rows) console.log(`  ${x.e}: ${x.n}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })