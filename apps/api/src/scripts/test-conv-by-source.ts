/**
 * READ-ONLY: GA4 conversions (purchase / phone / whatsapp / form) broken down by
 * traffic source — both first-user (acquisition) and session (last-click) — for a
 * date range. This is the "where did each conversion come from" slice.
 *   npx tsx src/scripts/test-conv-by-source.ts <agentId> <start> <end>
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const EVENTS = ['purchase', 'Phone_call_from_Leader_GA4', 'WhatsApp from Leader', 'form_submit', 'generate_lead']

async function refresh(rt: string) {
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
    return ((await r.json()) as any).access_token || null
}
async function resolveProperty(at: string, mid: string) {
    const j = await (await fetch(`${ADMIN_API}/accountSummaries?pageSize=200`, { headers: { Authorization: `Bearer ${at}` } })).json() as any
    for (const a of j.accountSummaries || []) for (const p of a.propertySummaries || []) {
        const dj = await (await fetch(`${ADMIN_API}/${p.property}/dataStreams?pageSize=50`, { headers: { Authorization: `Bearer ${at}` } })).json() as any
        for (const s of dj.dataStreams || []) if (s.webStreamData?.measurementId === mid) return p.property.replace('properties/', '')
    }
    return null
}
async function rep(at: string, prop: string, start: string, end: string, dims: string[]) {
    const r = await fetch(`${DATA_API}/properties/${prop}:runReport`, {
        method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRanges: [{ startDate: start, endDate: end }], dimensions: dims.map(d => ({ name: d })), metrics: [{ name: 'eventCount' }, { name: 'purchaseRevenue' }], dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: EVENTS } } }, limit: 500 }),
    })
    const j = await r.json() as any
    if (!r.ok) throw new Error(j?.error?.message || `GA4 ${r.status}`)
    return (j.rows || []).map((row: any) => ({ d: row.dimensionValues.map((x: any) => x.value), n: Number(row.metricValues[0]?.value || 0), rev: Number(row.metricValues[1]?.value || 0) }))
}
function table(rows: any[], srcIdx: number, medIdx: number) {
    const byEvent: Record<string, Record<string, number>> = {}
    for (const r of rows) {
        const ev = r.d[0]; const src = `${r.d[srcIdx]} / ${r.d[medIdx]}`
        byEvent[ev] = byEvent[ev] || {}; byEvent[ev][src] = (byEvent[ev][src] || 0) + r.n
    }
    for (const ev of Object.keys(byEvent)) {
        const total = Object.values(byEvent[ev]).reduce((a, b) => a + b, 0)
        console.log(`  ${ev}: total ${total}`)
        for (const [src, n] of Object.entries(byEvent[ev]).sort((a, b) => b[1] - a[1])) console.log(`      ${src} → ${n}`)
    }
}

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const start = process.argv[3] || '2026-06-01', end = process.argv[4] || '2026-06-01'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rd: any = a.researchData || {}
    const at = await refresh((a.googleTokens as any)?.refreshToken || (a.googleTokens as any)?.refresh_token)
    const prop = await resolveProperty(at, rd.mazhirGtm?.target?.measurementId)
    console.log(`\n=== conversions by source (property ${prop}, ${start}..${end}) ===`)
    console.log('\n— FIRST-USER (where the customer was ACQUIRED) —')
    table(await rep(at, prop!, start, end, ['eventName', 'firstUserSource', 'firstUserMedium']), 1, 2)
    console.log('\n— SESSION / last-click (what Google Ads uses for attribution) —')
    table(await rep(at, prop!, start, end, ['eventName', 'sessionSource', 'sessionMedium']), 1, 2)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })