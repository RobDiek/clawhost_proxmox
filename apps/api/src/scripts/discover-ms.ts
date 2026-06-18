/** Read-only discovery for MS: GA4 properties under the account, GSC sites,
 *  and what's actually on moving-station.co.il (GTM/GA4/companion/WordPress).
 *   node --env-file=.env --import tsx src/scripts/discover-ms.ts [agentId]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta'
const GSC = 'https://www.googleapis.com/webmasters/v3'

async function at(rt: string): Promise<string | null> {
    try {
        const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
        return ((await r.json()) as any).access_token || null
    } catch { return null }
}

async function main() {
    const agentId = process.argv[2] || 'mta_Xm8CfS3K'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const gt: any = a?.googleTokens || {}
    const token = await at(gt.refreshToken || gt.refresh_token)
    if (!token) { console.log('no access token'); process.exit(1) }

    // 1. GA4 — all properties + data streams (find moving-station)
    console.log('═══ GA4 PROPERTIES / DATA STREAMS (account) ═══')
    try {
        const j = await (await fetch(`${ADMIN}/accountSummaries?pageSize=200`, { headers: { Authorization: `Bearer ${token}` } })).json() as any
        for (const acc of j.accountSummaries || []) {
            for (const p of acc.propertySummaries || []) {
                const dj = await (await fetch(`${ADMIN}/${p.property}/dataStreams?pageSize=50`, { headers: { Authorization: `Bearer ${token}` } })).json() as any
                for (const s of dj.dataStreams || []) {
                    const w = s.webStreamData
                    if (!w) continue
                    const uri = (w.defaultUri || '').toLowerCase()
                    const mark = /moving-station/.test(uri) ? '  ⬅ MOVING' : /packing-station/.test(uri) ? '  (packing)' : /storage-station/.test(uri) ? '  (storage)' : ''
                    console.log(`  ${p.displayName} · ${w.measurementId} · ${w.defaultUri || '?'}${mark}`)
                }
            }
        }
    } catch (e) { console.log(`  GA4 admin failed: ${(e as Error).message}`) }

    // 2. GSC — accessible sites (needs webmasters scope)
    console.log('\n═══ GSC SITES (needs webmasters scope) ═══')
    try {
        const r = await fetch(`${GSC}/sites`, { headers: { Authorization: `Bearer ${token}` } })
        const j = await r.json() as any
        if (!r.ok) console.log(`  GSC error: ${j?.error?.message || r.status} (likely missing webmasters scope)`)
        else for (const s of (j.siteEntry || [])) console.log(`  ${s.siteUrl} · ${s.permissionLevel}${/moving-station/.test(s.siteUrl) ? '  ⬅ MOVING' : ''}`)
    } catch (e) { console.log(`  GSC failed: ${(e as Error).message}`) }

    // 3. Site scan — what's live on moving-station.co.il
    console.log('\n═══ moving-station.co.il LIVE SCAN ═══')
    try {
        const res = await fetch('https://moving-station.co.il/', { headers: { 'User-Agent': 'Mozilla/5.0 FlowmaticAudit' }, signal: AbortSignal.timeout(20000) })
        const html = await res.text()
        const gtm = [...html.matchAll(/GTM-[A-Z0-9]+/g)].map(m => m[0])
        const ga4 = [...html.matchAll(/G-[A-Z0-9]{6,}/g)].map(m => m[0])
        const uaIds = [...html.matchAll(/UA-\d+-\d+/g)].map(m => m[0])
        console.log(`  status ${res.status} · WordPress: ${/wp-content|wp-includes/.test(html) ? 'YES' : 'no'}`)
        console.log(`  GTM containers in page: ${[...new Set(gtm)].join(', ') || 'NONE'}`)
        console.log(`  GA4 tags in page: ${[...new Set(ga4)].join(', ') || 'NONE'}`)
        console.log(`  UA (legacy) tags: ${[...new Set(uaIds)].join(', ') || 'none'}`)
        console.log(`  gtag.js present: ${/gtag\/js|googletagmanager\.com\/gtag/.test(html) ? 'YES' : 'no'}`)
        console.log(`  clawflow companion (clawflow_gclid / cf-fab): ${/clawflow_gclid|clawflow_capture|cf-fab/.test(html) ? 'YES' : 'NOT FOUND'}`)
        console.log(`  Yaad/Hyp checkout refs: ${/yaad|hyp\.co\.il|icom/.test(html) ? 'YES' : 'no (not on homepage)'}`)
    } catch (e) { console.log(`  site fetch failed: ${(e as Error).message}`) }

    // 4. WP REST config (companion install capability)
    console.log('\n═══ MS WordPress REST config ═══')
    try {
        const { loadWpConfig } = await import('@/services/seoMetaBatch')
        const wp: any = await loadWpConfig(a!.vpsInstanceId, agentId).catch(() => null)
        console.log(`  wpConfig: ${wp ? `baseUrl=${wp.baseUrl || wp.url || '?'} user=${wp.username ? '<set>' : '—'} appPassword=${wp.appPassword || wp.password ? '<set>' : '—'}` : '— not configured'}`)
    } catch (e) { console.log(`  wpConfig load failed: ${(e as Error).message}`) }

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })