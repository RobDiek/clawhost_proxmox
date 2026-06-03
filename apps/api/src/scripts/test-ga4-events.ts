/** READ-ONLY: list ALL GA4 events by count for a window + per-week trend for a
 * target event — to see if WhatsApp/click tracking fires (and when it stopped).
 *   npx tsx src/scripts/test-ga4-events.ts <agentId> <start> <end>
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
const TOKEN_URL = 'https://oauth2.googleapis.com/token', ADMIN = 'https://analyticsadmin.googleapis.com/v1beta', DATA = 'https://analyticsdata.googleapis.com/v1beta'
async function refresh(rt: string) { const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) }); return ((await r.json()) as any).access_token }
async function prop(at: string, mid: string) { const j = await (await fetch(`${ADMIN}/accountSummaries?pageSize=200`, { headers: { Authorization: `Bearer ${at}` } })).json() as any; for (const a of j.accountSummaries || []) for (const p of a.propertySummaries || []) { const dj = await (await fetch(`${ADMIN}/${p.property}/dataStreams?pageSize=50`, { headers: { Authorization: `Bearer ${at}` } })).json() as any; for (const s of dj.dataStreams || []) if (s.webStreamData?.measurementId === mid) return p.property.replace('properties/', '') } return null }
async function rep(at: string, pr: string, start: string, end: string, dims: string[]) { const r = await fetch(`${DATA}/properties/${pr}:runReport`, { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ dateRanges: [{ startDate: start, endDate: end }], dimensions: dims.map(d => ({ name: d })), metrics: [{ name: 'eventCount' }], limit: 300, orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }] }) }); const j = await r.json() as any; if (!r.ok) throw new Error(j?.error?.message); return (j.rows || []).map((x: any) => ({ d: x.dimensionValues.map((v: any) => v.value), n: Number(x.metricValues[0]?.value || 0) })) }
async function main() {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, process.argv[2] || 'mta_Un9jXRuf'))
    const rd: any = a.researchData || {}; const at = await refresh((a.googleTokens as any).refreshToken || (a.googleTokens as any).refresh_token); const pr = await prop(at, rd.mazhirGtm?.target?.measurementId)
    const start = process.argv[3] || '2026-05-04', end = process.argv[4] || '2026-06-02'
    console.log(`\n=== ALL GA4 events ${start}..${end} (property ${pr}) ===`)
    for (const r of await rep(at, pr!, start, end, ['eventName'])) console.log(`  ${r.d[0]}: ${r.n}`)
    console.log(`\n=== weekly trend for whatsapp/contact/click-ish events ===`)
    const wk = await rep(at, pr!, start, end, ['eventName', 'week'])
    const hit = wk.filter((r: any) => /whats|contact|click|leader|wa_|message/i.test(r.d[0]))
    for (const r of hit.sort((x: any, y: any) => x.d[1].localeCompare(y.d[1]))) console.log(`  wk${r.d[1]} ${r.d[0]}: ${r.n}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })