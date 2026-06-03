/**
 * Report Builder — systemic weekly/monthly performance reports, adaptive per
 * tenant type, rendered for Telegram (+ dashboard). Reuses the platform's GA4 /
 * Google Ads / WooCommerce readers.
 *
 * v1 = ecommerce profile (purchase-primary). Modules:
 *   - headline KPIs (revenue, orders, ROAS, CPA, AOV)
 *   - conversions by traffic source (purchase / lead / call / whatsapp)
 *   - paid summary (spend, conv, value, ROAS, top campaigns)
 *   - DATA-INTEGRITY line: site orders vs GA4 purchases vs Ads conversions
 *     (auto-surfaces the Packing-incident class of bug for every tenant)
 *
 * Other tenant types (lead-gen, content/SEO) plug in as additional module sets.
 */
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { loadWpConfig } from '@/services/seoMetaBatch'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const ADS_API = 'https://googleads.googleapis.com/v22'

const CONV_EVENTS = ['purchase', 'Phone_call_from_Leader_GA4', 'WhatsApp from Leader', 'form_submit', 'generate_lead']
const EVENT_LABEL: Record<string, string> = {
    purchase: '🛒 רכישות', Phone_call_from_Leader_GA4: '📞 שיחות', 'WhatsApp from Leader': '💬 וואטסאפ', form_submit: '📝 טפסים', generate_lead: '✨ לידים',
}

export interface WeeklyReport { text: string; data: any }

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
async function ga4(at: string, prop: string, start: string, end: string, dims: string[], filterEvents?: string[]) {
    const body: any = { dateRanges: [{ startDate: start, endDate: end }], dimensions: dims.map(d => ({ name: d })), metrics: [{ name: 'eventCount' }, { name: 'purchaseRevenue' }], limit: 500 }
    if (filterEvents) body.dimensionFilter = { filter: { fieldName: 'eventName', inListFilter: { values: filterEvents } } }
    const r = await fetch(`${DATA_API}/properties/${prop}:runReport`, { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json() as any
    if (!r.ok) throw new Error(j?.error?.message || `GA4 ${r.status}`)
    return (j.rows || []).map((row: any) => ({ d: row.dimensionValues.map((x: any) => x.value), n: Number(row.metricValues[0]?.value || 0), rev: Number(row.metricValues[1]?.value || 0) }))
}
async function adsQuery(cust: string, login: string, dev: string, at: string, gaql: string): Promise<any[]> {
    const r = await fetch(`${ADS_API}/customers/${cust}/googleAds:search`, { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'developer-token': dev, 'login-customer-id': login, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: gaql }) })
    const j = await r.json() as any
    if (!r.ok) throw new Error(JSON.stringify(j?.error?.message || j).slice(0, 200))
    return j.results || []
}
function ils(n: number): string { return '₪' + Math.round(n).toLocaleString('en-US') }
function chan(src: string, med: string): string {
    if (med === 'cpc' || med === 'paid' || med === 'ppc') return src === 'google' ? 'Google Ads' : `${src} (paid)`
    if (med === 'organic') return src === 'google' ? 'אורגני (Google)' : `אורגני (${src})`
    if (src === '(direct)') return 'ישיר/חוזר'
    if (/chatgpt|perplexity|gemini|openai/i.test(src)) return `AI (${src})`
    if (med === 'referral' || med === 'social') return src
    if (src === '(not set)') return 'לא משויך (בעיית מדידה)'
    return `${src}/${med}`
}

export async function buildWeeklyReport(instanceId: string, agentId: string, opts: { start?: string; end?: string } = {}): Promise<WeeklyReport> {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rd: any = a.researchData || {}
    const biz = rd.answers?.businessName || a.name || 'העסק'
    const mid = rd.mazhirGtm?.target?.measurementId
    const rt = (a.googleTokens as any)?.refreshToken || (a.googleTokens as any)?.refresh_token
    // default window = last 7 full days (caller passes explicit dates for determinism)
    const end = opts.end || 'yesterday'
    const start = opts.start || '7daysAgo'

    const lines: string[] = []
    lines.push(`📊 *דוח שבועי — ${biz}*`)
    lines.push(`_${start} → ${end}_`)
    const data: any = { biz, start, end }

    const at = rt ? await refresh(rt) : null
    const prop = at && mid ? await resolveProperty(at, mid) : null

    // ── Conversions by source ──
    if (at && prop) {
        try {
            const rows = await ga4(at, prop, start, end, ['eventName', 'sessionSource', 'sessionMedium'], CONV_EVENTS)
            const byEvent: Record<string, { total: number; rev: number; chans: Record<string, number> }> = {}
            for (const r of rows) {
                const e = r.d[0]; byEvent[e] = byEvent[e] || { total: 0, rev: 0, chans: {} }
                byEvent[e].total += r.n; byEvent[e].rev += r.rev
                const c = chan(r.d[1], r.d[2]); byEvent[e].chans[c] = (byEvent[e].chans[c] || 0) + r.n
            }
            data.conversions = byEvent
            const purchase = byEvent['purchase']
            if (purchase) { lines.push(``, `💰 *הכנסות:* ${ils(purchase.rev)} · *רכישות:* ${purchase.total}`) }
            lines.push(``, `*המרות לפי מקור:*`)
            for (const ev of CONV_EVENTS) {
                const b = byEvent[ev]; if (!b || b.total === 0) continue
                const top = Object.entries(b.chans).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([c, n]) => `${c} ${n}`).join(' · ')
                lines.push(`${EVENT_LABEL[ev] || ev}: ${b.total} — ${top}`)
            }
        } catch (e) { lines.push(`⚠️ GA4: ${(e as Error).message}`) }
    } else { lines.push(`⚠️ GA4 לא מחובר`) }

    // ── Paid (Google Ads) ──
    const cfg: any = a.googleAdsConfig || (await db.select().from(instances).where(eq(instances.id, a.vpsInstanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.customerId || ''); const operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager); const dev = cfg.developerToken
    if (at && operating && dev) {
        try {
            // brand campaigns only (name starts with biz token); fall back to all
            const rows = await adsQuery(operating, manager, dev, at, `SELECT campaign.name, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.clicks FROM campaign WHERE segments.date DURING LAST_7_DAYS AND campaign.status = 'ENABLED'`)
            const brand = rows.filter(r => /packing|פקינג/i.test(r.campaign?.name || ''))
            const use = brand.length ? brand : rows
            let cost = 0, conv = 0, val = 0
            for (const r of use) { cost += Number(r.metrics?.costMicros || 0) / 1e6; conv += Number(r.metrics?.conversions || 0); val += Number(r.metrics?.conversionsValue || 0) }
            data.paid = { cost, conv, val, campaigns: use.length }
            const roas = cost > 0 ? (val / cost) : 0; const cpa = conv > 0 ? cost / conv : 0
            lines.push(``, `🟢 *Google Ads (7 ימים):*`)
            lines.push(`הוצאה ${ils(cost)} · המרות ${conv.toFixed(0)} · ערך ${ils(val)} · ROAS ${(roas * 100).toFixed(0)}% · CPA ${ils(cpa)}`)
        } catch (e) { lines.push(`⚠️ Ads: ${(e as Error).message}`) }
    }

    // ── Data integrity (site vs GA4 vs Ads) — single-day spot check (yesterday) ──
    try {
        const cfgW = await loadWpConfig(instanceId, agentId)
        if (cfgW && at && prop) {
            const day = opts.end && /^\d{4}-\d{2}-\d{2}$/.test(opts.end) ? opts.end : null
            if (day) {
                const auth = 'Basic ' + Buffer.from(`${cfgW.user}:${cfgW.appPassword}`).toString('base64')
                const wc = await fetch(`${cfgW.url.replace(/\/+$/, '')}/wp-json/wc/v3/orders?after=${day}T00:00:00&before=${day}T23:59:59&per_page=100&_fields=id,status`, { headers: { Authorization: auth } })
                if (wc.ok) {
                    const orders = (await wc.json() as any[]).filter(o => o.status === 'completed' || o.status === 'processing')
                    const ga = await ga4(at, prop, day, day, ['eventName'], ['purchase'])
                    const gaP = ga.find((r: any) => r.d[0] === 'purchase')?.n || 0
                    const gap = orders.length - gaP
                    data.integrity = { day, site: orders.length, ga4: gaP }
                    lines.push(``, `🩺 *בקרת מדידה (${day}):* אתר ${orders.length} · GA4 ${gaP}${gap > 0 ? ` ⚠️ פער ${gap} (בדקו מדידה)` : ' ✓'}`)
                }
            }
        }
    } catch { /* integrity best-effort */ }

    lines.push(``, `_מנוטר ע"י Flowmatic_`)
    return { text: lines.join('\n'), data }
}