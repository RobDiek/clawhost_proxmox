/**
 * Conversion reconciliation part 2 (READ-ONLY): GA4 key-events config + Google
 * Ads conversions/actions for one day, to explain GA4-UI "conversions" count +
 * the Ads conversion count.
 *   npx tsx src/scripts/test-conv-reconcile2.ts <agentId> <YYYY-MM-DD>
 */
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'
const ADS_API = 'https://googleads.googleapis.com/v22'

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
async function adsQuery(customerId: string, login: string, dev: string, at: string, gaql: string): Promise<any[]> {
    const r = await fetch(`${ADS_API}/customers/${customerId}/googleAds:search`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${at}`, 'developer-token': dev, 'login-customer-id': login, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gaql }),
    })
    const j = await r.json() as any
    if (!r.ok) throw new Error(JSON.stringify(j?.error?.message || j).slice(0, 300))
    return j.results || []
}

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const date = process.argv[3] || '2026-06-01'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rd: any = a.researchData || {}
    const mid = rd.mazhirGtm?.target?.measurementId
    const rt = (a.googleTokens as any)?.refreshToken || (a.googleTokens as any)?.refresh_token
    const at = await refresh(rt)
    if (!at) { console.log('no access token'); process.exit(0) }

    // ── GA4 key events ──
    const prop = await resolveProperty(at, mid)
    console.log(`\n=== GA4 key events (property ${prop}) ===`)
    const ke = await (await fetch(`${ADMIN_API}/properties/${prop}/keyEvents?pageSize=50`, { headers: { Authorization: `Bearer ${at}` } })).json() as any
    const list = (ke.keyEvents || []).map((k: any) => k.eventName)
    console.log('key events:', JSON.stringify(list), list.includes('purchase') ? '— purchase IS a key event' : '— purchase NOT a key event!')

    // ── Google Ads ──
    const cfg: any = a.googleAdsConfig || (await db.select().from(instances).where(eq(instances.id, a.vpsInstanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.customerId || '')
    const operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager)
    const dev = cfg.developerToken
    const d = date.replace(/-/g, '')
    console.log(`\n=== Google Ads (operating ${operating}, login ${manager}) date ${date} ===`)
    try {
        const conv = await adsQuery(operating, manager, dev, at,
            `SELECT campaign.name, segments.conversion_action_name, metrics.conversions, metrics.all_conversions FROM campaign WHERE segments.date = '${date}' AND metrics.all_conversions > 0`)
        if (!conv.length) console.log('  (no conversions rows for this date)')
        for (const r of conv) console.log(`  campaign="${r.campaign?.name}" action="${r.segments?.conversionActionName}" conv=${r.metrics?.conversions} allConv=${r.metrics?.allConversions}`)
    } catch (e) { console.log('  ads conv ERR:', (e as Error).message) }

    console.log(`\n=== Conversion ACTIONS in account ${operating} ===`)
    try {
        const acts = await adsQuery(operating, manager, dev, at,
            `SELECT conversion_action.name, conversion_action.id, conversion_action.status, conversion_action.type, conversion_action.primary_for_goal, conversion_action.category FROM conversion_action WHERE conversion_action.status != 'REMOVED'`)
        for (const r of acts) { const c = r.conversionAction; console.log(`  [${c.status}] "${c.name}" id=${c.id} type=${c.type} cat=${c.category} primaryForGoal=${c.primaryForGoal}`) }
    } catch (e) { console.log('  actions ERR:', (e as Error).message) }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })