/** Read-only: verify MS GSC live (correct gscTokens path) + diff MS vs PS
 *  analytics bindings (mazhirGtm, offlineConversions) to get replication deltas.
 *   node --env-file=.env --import tsx src/scripts/verify-ms-vs-ps.ts
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GSC = 'https://www.googleapis.com/webmasters/v3'

async function at(rt: string): Promise<string | null> {
    try {
        const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
        return ((await r.json()) as any).access_token || null
    } catch { return null }
}

async function load(id: string) {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, id))
    return a
}

async function main() {
    const MS = await load('mta_Xm8CfS3K'), PS = await load('mta_Un9jXRuf')

    // 1. GSC live verification (via gscTokens — the correct store)
    console.log('═══ GSC LIVE (via gscTokens) ═══')
    for (const [label, a] of [['MS', MS], ['PS', PS]] as const) {
        const gt: any = a?.gscTokens || {}
        if (!gt.refreshToken && !gt.refresh_token) { console.log(`  ${label}: gscTokens MISSING`); continue }
        console.log(`  ${label}: email=${gt.email || '—'} siteUrl=${gt.siteUrl || '—'} sites=${(gt.sites || []).length}`)
        const token = await at(gt.refreshToken || gt.refresh_token)
        if (!token) { console.log(`    ↳ token refresh FAILED`); continue }
        try {
            const site = gt.siteUrl || (gt.sites || [])[0]
            const r = await fetch(`${GSC}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate: '2026-05-19', endDate: '2026-06-16', dimensions: ['query'], rowLimit: 3 }),
            })
            const j = await r.json() as any
            if (!r.ok) console.log(`    ↳ GSC query FAILED: ${j?.error?.message || r.status}`)
            else {
                const rows = j.rows || []
                const tot = rows.reduce((s: number, x: any) => s + (x.clicks || 0), 0)
                console.log(`    ↳ ✅ GSC LIVE: ${rows.length} top queries, e.g. "${rows[0]?.keys?.[0] || '—'}" (${rows[0]?.clicks || 0} clk) · works`)
            }
        } catch (e) { console.log(`    ↳ GSC query error: ${(e as Error).message}`) }
    }

    // 2. mazhirGtm diff
    console.log('\n═══ mazhirGtm (GA4/GTM binding) ═══')
    console.log('  PS:', JSON.stringify((PS?.researchData as any)?.mazhirGtm || null))
    console.log('  MS:', JSON.stringify((MS?.researchData as any)?.mazhirGtm || null))

    // 3. offlineConversions diff (the gclid bridge)
    console.log('\n═══ offlineConversions (gclid bridge) ═══')
    console.log('  PS:', JSON.stringify((PS?.researchData as any)?.offlineConversions || null))
    console.log('  MS:', JSON.stringify((MS?.researchData as any)?.offlineConversions || null))

    // 4. other analytics-relevant rd keys present on PS but not MS
    console.log('\n═══ analytics rd keys (present?) ═══')
    const keys = ['mazhirGtm', 'offlineConversions', 'mazhirConversions', 'conversionMapping', 'gtmInstall', 'trackingHealth', 'biddingObjective']
    for (const k of keys) {
        const ps = (PS?.researchData as any)?.[k] ? '✓' : '—'
        const ms = (MS?.researchData as any)?.[k] ? '✓' : '—'
        console.log(`  ${k.padEnd(22)} PS=${ps}  MS=${ms}`)
    }

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })