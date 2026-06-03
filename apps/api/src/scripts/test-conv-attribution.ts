/**
 * READ-ONLY: GA4 purchase attribution by session source/medium for one day.
 * Confirms whether a redirect payment gateway is stealing google/cpc attribution
 * (purchases landing on yaad.net/referral or (direct) instead of google/cpc) —
 * the usual reason Google Ads under-counts conversions.
 *   npx tsx src/scripts/test-conv-attribution.ts <agentId> <YYYY-MM-DD>
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'

async function refresh(rt: string): Promise<string | null> {
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
    return ((await r.json()) as any).access_token || null
}
async function resolveProperty(at: string, mid: string): Promise<string | null> {
    const j = await (await fetch(`${ADMIN_API}/accountSummaries?pageSize=200`, { headers: { Authorization: `Bearer ${at}` } })).json() as any
    for (const a of j.accountSummaries || []) for (const p of a.propertySummaries || []) {
        const dj = await (await fetch(`${ADMIN_API}/${p.property}/dataStreams?pageSize=50`, { headers: { Authorization: `Bearer ${at}` } })).json() as any
        for (const s of dj.dataStreams || []) if (s.webStreamData?.measurementId === mid) return p.property.replace('properties/', '')
    }
    return null
}
async function report(at: string, prop: string, date: string, dims: string[]) {
    const r = await fetch(`${DATA_API}/properties/${prop}:runReport`, {
        method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRanges: [{ startDate: date, endDate: date }], dimensions: dims.map(d => ({ name: d })), metrics: [{ name: 'eventCount' }, { name: 'purchaseRevenue' }], dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'purchase' } } }, limit: 200 }),
    })
    const j = await r.json() as any
    if (!r.ok) throw new Error(j?.error?.message || `GA4 ${r.status}`)
    return (j.rows || []).map((row: any) => ({ dims: row.dimensionValues.map((d: any) => d.value), count: Number(row.metricValues[0]?.value || 0), rev: Number(row.metricValues[1]?.value || 0) }))
}

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const date = process.argv[3] || '2026-06-01'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rd: any = a.researchData || {}
    const mid = rd.mazhirGtm?.target?.measurementId
    const rt = (a.googleTokens as any)?.refreshToken || (a.googleTokens as any)?.refresh_token
    const at = await refresh(rt); if (!at) { console.log('no token'); process.exit(0) }
    const prop = await resolveProperty(at, mid)
    console.log(`\n=== GA4 purchases by attribution (property ${prop}, ${date}) ===`)
    console.log('\nby session source / medium:')
    for (const r of await report(at, prop!, date, ['sessionSource', 'sessionMedium'])) console.log(`  ${r.dims[0]} / ${r.dims[1]} → ${r.count} purchases (₪${r.rev})`)
    console.log('\nby default channel group:')
    for (const r of await report(at, prop!, date, ['sessionDefaultChannelGroup'])) console.log(`  ${r.dims[0]} → ${r.count} (₪${r.rev})`)
    console.log('\nby first-user source / medium (acquisition):')
    for (const r of await report(at, prop!, date, ['firstUserSource', 'firstUserMedium'])) console.log(`  ${r.dims[0]} / ${r.dims[1]} → ${r.count}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })