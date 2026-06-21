/**
 * SEO CTR Optimizer — systemic, all tenants.
 *
 * Closes a real gap: pages that already RANK at a good position (4–15) but earn
 * few/no clicks are leaving the cheapest organic traffic on the table — the rank
 * is won, only the SERP title/snippet fails to earn the click. seoMetaBatch only
 * FILLS empty/weak meta; it never rewrites a present-but-unappealing title for
 * CTR, and it isn't GSC-driven. This service is:
 *
 *   select by GSC CTR-gap (impressions high, CTR far below position-expected)
 *     → rewrite a compelling SEO TITLE + meta description anchored on the page's
 *       actual top ranking query → write via Yoast/Rank Math REST (companion
 *       registers these meta keys) with read-back verification.
 *
 * Per-agent (GSC + WordPress resolved from the active agent). Dry-run returns the
 * proposed title/meta without writing — preview before publish.
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'
import { loadWpConfig, type WpCfg } from '@/services/seoMetaBatch'

const WM = 'https://www.googleapis.com/webmasters/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADS_MAX = 12            // hard cap on rewrites per run (API spend + write volume)

type WpType = 'posts' | 'pages' | 'product'

export interface CtrCandidate {
    url: string
    type?: WpType
    id?: number
    currentTitle?: string
    topQuery: string
    impressions: number
    clicks: number
    ctr: number
    position: number
    expectedCtr: number
    newTitle?: string
    newMeta?: string
}

export interface CtrOptimizerResult {
    ok: boolean
    reason?: string
    siteUrl?: string
    scanned: number
    candidates: number
    updated: CtrCandidate[]
    skipped: Array<{ url: string; reason: string }>
    failures: Array<{ url: string; error: string }>
}

// Rough position→expected-CTR curve (organic, blended desktop+mobile). A page
// far below its position's expected CTR is a title/snippet problem, not a rank
// problem — the exact target for a rewrite.
function expectedCtr(pos: number): number {
    if (pos <= 1) return 0.27
    if (pos <= 2) return 0.15
    if (pos <= 3) return 0.10
    if (pos <= 5) return 0.06
    if (pos <= 8) return 0.035
    if (pos <= 10) return 0.022
    return 0.013
}

function authHeader(cfg: WpCfg): string {
    return 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')
}
function normUrl(u: string): string { return u.replace(/\/+$/, '') }
function stripHtml(s: string): string { return String(s || '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim() }
function decodeSafe(u: string): string { try { return decodeURIComponent(u) } catch { return u } }

async function refreshToken(rt: string): Promise<string | null> {
    const id = process.env.GOOGLE_CLIENT_ID || '', sec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!id || !sec || !rt) return null
    try {
        const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: id, client_secret: sec, refresh_token: rt, grant_type: 'refresh_token' }) })
        return ((await r.json()) as any).access_token || null
    } catch { return null }
}

async function resolveSite(accessToken: string, siteUrl: string): Promise<string> {
    try {
        const r = await fetch(`${WM}/sites`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) })
        const j = await r.json() as { siteEntry?: Array<{ siteUrl: string; permissionLevel?: string }> }
        const all = (j.siteEntry || []).filter(s => s.permissionLevel && s.permissionLevel !== 'siteUnverifiedUser')
        const host = siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase().replace(/^www\./, '')
        const domain = all.find(s => s.siteUrl === `sc-domain:${host}`)
        const prefix = all.find(s => s.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase() === host)
        const brand = all.find(s => s.siteUrl.toLowerCase().includes(host.split('.')[0]))
        return domain?.siteUrl || prefix?.siteUrl || brand?.siteUrl || siteUrl
    } catch { return siteUrl }
}

/** Resolve a WP post/page/product by exact slug (?slug=). Returns first hit. */
async function resolveBySlug(cfg: WpCfg, slug: string): Promise<{ type: WpType; id: number; title: string } | null> {
    const base = normUrl(cfg.url)
    for (const type of ['posts', 'pages', 'product'] as WpType[]) {
        try {
            const r = await fetch(`${base}/wp-json/wp/v2/${type}?slug=${encodeURIComponent(slug)}&status=publish&context=edit&_fields=id,title`, { headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(20_000) })
            if (!r.ok) continue
            const arr = await r.json().catch(() => []) as any[]
            const it = Array.isArray(arr) ? arr[0] : null
            if (it && typeof it.id === 'number') return { type, id: it.id, title: stripHtml(it.title?.rendered || it.title?.raw || '') }
        } catch { /* next type */ }
    }
    return null
}

function slugOf(url: string): string {
    return decodeSafe(url.split(/[?#]/)[0].replace(/\/$/, '').split('/').pop() || url)
}

async function writeTitleMeta(cfg: WpCfg, type: WpType, id: number, title: string, meta: string): Promise<void> {
    const base = normUrl(cfg.url)
    const body = { meta: { _yoast_wpseo_title: title, rank_math_title: title, _yoast_wpseo_metadesc: meta, rank_math_description: meta } }
    const res = await fetch(`${base}/wp-json/wp/v2/${type}/${id}`, { method: 'POST', headers: { Authorization: authHeader(cfg), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
    // Read back — unregistered meta keys are silently dropped by WP.
    const chk = await fetch(`${base}/wp-json/wp/v2/${type}/${id}?context=edit&_fields=meta`, { headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30_000) })
    if (chk.ok) {
        const m = ((await chk.json().catch(() => null)) as any)?.meta || {}
        const ok = m._yoast_wpseo_title === title || m.rank_math_title === title
        if (!ok) throw new Error('title_not_persisted: WP accepted write but did not store SEO title — companion plugin (show_in_rest meta) likely missing')
    }
}

async function generateTitleMeta(apiKey: string, model: string, businessName: string, c: CtrCandidate): Promise<{ title: string; meta: string } | null> {
    const prompt = `אתם עורך SEO בכיר של "${businessName}". עמוד מדורג בגוגל במיקום ${c.position.toFixed(0)} על הביטוי "${c.topQuery}" עם ${c.impressions} חשיפות אך כמעט בלי קליקים (CTR ${(c.ctr * 100).toFixed(1)}%). הדירוג כבר הושג — הכותרת/תיאור ב-SERP פשוט לא גורמים לקליק. שכתבו אותם כדי למקסם קליקים.

## נתונים
כותרת נוכחית: ${c.currentTitle || '—'}
ביטוי החיפוש שעליו מדורגים: ${c.topQuery}

## חוקים
- title: עד 60 תווים, עברית, מתחיל בביטוי החיפוש או קרוב אליו, עם וו קליק (מספר/תועלת/דחיפות/מיקום). בלי שם המותג אלא אם קצר ומוסיף.
- meta: 140-160 תווים, עברית, ממשיך את ההבטחה, כולל CTA עדין. בלי גרשיים כפולים, בלי שורות חדשות.
- 100% עברית (חוץ משמות מותג). אל תמציאו עובדות/מחירים/רייטינג.

## פלט
החזירו אך ורק JSON תקין: {"title":"...","meta":"..."}`
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
            signal: AbortSignal.timeout(60_000),
        })
        if (!res.ok) return null
        const data: any = await res.json()
        const text = (data?.content?.[0]?.text || '').trim()
        const m = text.match(/\{[\s\S]*\}/)
        if (!m) return null
        const obj = JSON.parse(m[0])
        const title = String(obj.title || '').trim()
        const meta = String(obj.meta || '').trim()
        if (!title || !meta) return null
        return { title: title.slice(0, 70), meta: meta.slice(0, 165) }
    } catch { return null }
}

export interface CtrOptimizerOpts {
    agentId?: string | null
    businessName?: string
    dryRun?: boolean
    limit?: number
    minImpressions?: number     // default 80
    gapFactor?: number          // candidate if ctr < expectedCtr*gapFactor (default 0.5)
    days?: number               // GSC window, default 90
}

export async function runCtrOptimizer(instanceId: string, opts: CtrOptimizerOpts = {}): Promise<CtrOptimizerResult> {
    const result: CtrOptimizerResult = { ok: false, scanned: 0, candidates: 0, updated: [], skipped: [], failures: [] }
    const limit = Math.min(opts.limit ?? 8, ADS_MAX)
    const minImp = opts.minImpressions ?? 80
    const gap = opts.gapFactor ?? 0.5
    const days = opts.days ?? 90

    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, String(opts.agentId || ''))) as any[]
    const gt: any = agent?.gscTokens || {}
    const rt = gt.refreshToken || gt.refresh_token
    if (!rt || !gt.siteUrl) { result.reason = 'gsc_not_connected'; result.ok = true; return result }
    const cfg = await loadWpConfig(instanceId, opts.agentId)
    if (!cfg) { result.reason = 'wordpress_not_connected'; result.ok = true; return result }

    const token = await refreshToken(rt)
    if (!token) { result.reason = 'token_refresh_failed'; return result }
    const site = await resolveSite(token, gt.siteUrl)
    result.siteUrl = site

    // Pull page+query rows, aggregate per page.
    const end = new Date().toISOString().slice(0, 10)
    const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
    let rows: any[] = []
    try {
        const r = await fetch(`${WM}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['page', 'query'], rowLimit: 5000 }),
            signal: AbortSignal.timeout(30_000),
        })
        const j = await r.json() as any
        if (j.error) { result.reason = `gsc_api: ${j.error.message}`; return result }
        rows = j.rows || []
    } catch (e) { result.reason = `gsc_fetch_failed: ${(e as Error).message}`; return result }

    // Aggregate per page; track top query by impressions.
    const byPage = new Map<string, { imp: number; clk: number; posW: number; top: { q: string; imp: number } }>()
    for (const row of rows) {
        const page = row.keys?.[0], query = row.keys?.[1]
        if (!page) continue
        const imp = Number(row.impressions || 0), clk = Number(row.clicks || 0), pos = Number(row.position || 0)
        const cur = byPage.get(page) || { imp: 0, clk: 0, posW: 0, top: { q: '', imp: 0 } }
        cur.imp += imp; cur.clk += clk; cur.posW += pos * imp
        if (imp > cur.top.imp) cur.top = { q: query || '', imp }
        byPage.set(page, cur)
    }
    result.scanned = byPage.size

    // Select CTR-gap candidates.
    const cands: CtrCandidate[] = []
    for (const [url, a] of byPage) {
        const pos = a.imp ? a.posW / a.imp : 99
        const ctr = a.imp ? a.clk / a.imp : 0
        if (pos > 15 || a.imp < minImp) continue
        const exp = expectedCtr(pos)
        if (ctr >= exp * gap) continue
        if (!a.top.q) continue
        cands.push({ url, topQuery: a.top.q, impressions: a.imp, clicks: a.clk, ctr, position: pos, expectedCtr: exp })
    }
    // Biggest opportunity first: impressions × CTR shortfall.
    cands.sort((x, y) => (y.impressions * (y.expectedCtr - y.ctr)) - (x.impressions * (x.expectedCtr - x.ctr)))
    result.candidates = cands.length

    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) { result.reason = 'no_api_key'; return result }
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const businessName = opts.businessName || (agent?.researchData as any)?.answers?.businessName || 'העסק'

    for (const c of cands.slice(0, limit)) {
        const resolved = await resolveBySlug(cfg, slugOf(c.url))
        if (!resolved) { result.skipped.push({ url: c.url, reason: 'wp_post_not_found_by_slug' }); continue }
        c.type = resolved.type; c.id = resolved.id; c.currentTitle = resolved.title
        const gen = await generateTitleMeta(apiKey, model, businessName, c)
        if (!gen) { result.failures.push({ url: c.url, error: 'generation_failed' }); continue }
        c.newTitle = gen.title; c.newMeta = gen.meta
        if (!opts.dryRun) {
            try { await writeTitleMeta(cfg, resolved.type, resolved.id, gen.title, gen.meta) }
            catch (e) { result.failures.push({ url: c.url, error: (e as Error).message }); continue }
        }
        result.updated.push(c)
    }

    result.ok = true
    return result
}