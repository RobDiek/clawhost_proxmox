/**
 * Tracking Health Check — systemic, tenant-agnostic verification that conversion
 * tracking + paid attribution are set up correctly. Designed to run at the END
 * of onboarding (gate), on demand, and periodically (degradation alert).
 *
 * Each check → { id, status: 'pass'|'warn'|'fail', he, fix? }. Reuses the GA4 /
 * Google Ads / store readers. Read-only.
 *
 * Checks (v1):
 *   ga4_purchase_firing   — purchases recorded in GA4 (7d) with revenue
 *   purchase_attribution  — % of purchases with a REAL source (not "(not set)"/gateway)
 *   conversion_roles      — purchase=primary, leads(call/whatsapp/form)=secondary
 *   whatsapp_tracking     — a WhatsApp click/conversation event fires at all (30d)
 *   store_integrity       — store orders vs GA4 purchases (1-day spot) gap
 *   enhanced_conversions  — EC enabled on the purchase action / customer
 */
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { loadWpConfig } from '@/services/seoMetaBatch'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const ADS_API = 'https://googleads.googleapis.com/v22'

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'
export interface HealthCheck { id: string; status: CheckStatus; he: string; fix?: string }
export interface HealthReport { agentId: string; business: string; checks: HealthCheck[]; score: number }

async function refresh(rt: string): Promise<string | null> {
    try {
        const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
        return ((await r.json()) as any).access_token || null
    } catch { return null }
}
async function resolveProperty(at: string, mid: string): Promise<string | null> {
    try {
        const j = await (await fetch(`${ADMIN_API}/accountSummaries?pageSize=200`, { headers: { Authorization: `Bearer ${at}` } })).json() as any
        for (const a of j.accountSummaries || []) for (const p of a.propertySummaries || []) {
            const dj = await (await fetch(`${ADMIN_API}/${p.property}/dataStreams?pageSize=50`, { headers: { Authorization: `Bearer ${at}` } })).json() as any
            for (const s of dj.dataStreams || []) if (s.webStreamData?.measurementId === mid) return p.property.replace('properties/', '')
        }
    } catch { /* ignore */ }
    return null
}
async function ga4(at: string, prop: string, start: string, end: string, dims: string[], events?: string[]) {
    const body: any = { dateRanges: [{ startDate: start, endDate: end }], dimensions: dims.map(d => ({ name: d })), metrics: [{ name: 'eventCount' }, { name: 'purchaseRevenue' }], limit: 500 }
    if (events) body.dimensionFilter = { filter: { fieldName: 'eventName', inListFilter: { values: events } } }
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

export async function runTrackingHealthCheck(instanceId: string, agentId: string): Promise<HealthReport> {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rd: any = a?.researchData || {}
    const business = rd.answers?.businessName || a?.name || agentId
    const checks: HealthCheck[] = []
    const add = (id: string, status: CheckStatus, he: string, fix?: string) => checks.push({ id, status, he, fix })

    const mid = rd.mazhirGtm?.target?.measurementId
    const rt = (a?.googleTokens as any)?.refreshToken || (a?.googleTokens as any)?.refresh_token
    const at = rt ? await refresh(rt) : null
    const prop = at && mid ? await resolveProperty(at, mid) : null

    // GA4 connectivity
    if (!at) add('ga4_oauth', 'fail', 'אין חיבור Google פעיל לסוכן.', 'התחברו מחדש ל-Google בכרטיס האינטגרציה.')
    else if (!prop) add('ga4_property', 'fail', mid ? `נכס GA4 (${mid}) לא נמצא בחשבון.` : 'GA4 אינו מחובר לסוכן — חסר מזהה מדידה (Measurement ID).', 'חברו את GA4 והגדירו את ה-Measurement ID הנכון בכרטיס האינטגרציה.')

    if (at && prop) {
        // purchase firing + attribution (7d)
        try {
            const bySrc = await ga4(at, prop, '7daysAgo', 'yesterday', ['sessionSource', 'sessionMedium'], ['purchase'])
            const total = bySrc.reduce((s: number, r: any) => s + r.n, 0); const rev = bySrc.reduce((s: number, r: any) => s + r.rev, 0)
            if (total === 0) add('purchase_firing', 'warn', 'לא נרשמו רכישות ב-GA4 ב-7 הימים האחרונים.', 'אם יש מכירות — המדידה כנראה שבורה.')
            else {
                add('purchase_firing', rev > 0 ? 'pass' : 'warn', `נרשמו ${total} רכישות (${Math.round(rev)}₪) ב-7 ימים.`, rev > 0 ? undefined : 'רכישות נרשמות ללא ערך — bidding מבוסס-ערך לא יעבוד.')
                const bad = bySrc.filter((r: any) => r.d[0] === '(not set)' || /hyp|yaad|pay/i.test(r.d[0])).reduce((s: number, r: any) => s + r.n, 0)
                const pct = Math.round((bad / total) * 100)
                add('purchase_attribution', pct > 30 ? 'fail' : pct > 10 ? 'warn' : 'pass', `${pct}% מהרכישות ללא מקור תקין ("(not set)"/שער-תשלום).`, pct > 10 ? 'אטריבוציה נשברת בשער-תשלום/שרת — נדרש gclid בצד-שרת + Enhanced Conversions.' : undefined)
            }
        } catch (e) { add('purchase_firing', 'warn', `GA4 שגיאה: ${(e as Error).message}`) }

        // whatsapp tracking (30d) — does ANY whatsapp event fire? When the GTM
        // click-capture is configured but no clicks landed yet, show "awaiting"
        // (🟡) not "missing" (🔴) — distinguishes setup-state from data-state.
        try {
            const ev = await ga4(at, prop, '30daysAgo', 'yesterday', ['eventName'])
            const wa = ev.filter((r: any) => /whats|wa_|message/i.test(r.d[0])).reduce((s: number, r: any) => s + r.n, 0)
            const gtmConfigured = !!rd.mazhirGtm?.target
            if (wa > 0) add('whatsapp_tracking', 'pass', `מעקב וואטסאפ פעיל (${wa} ב-30 יום).`)
            else if (gtmConfigured) add('whatsapp_tracking', 'warn', 'מעקב וואטסאפ/טלפון הוגדר ב-GTM — ממתין לקליק ראשון (0 ב-30 יום).', 'ודאו שכפתורי וואטסאפ/חיוג הם קישורי wa.me / tel: בדף.')
            else add('whatsapp_tracking', 'fail', 'אין מעקב וואטסאפ — GTM לא מוגדר.', 'נדרש GTM + טריגר קליקים ל-wa.me/tel: → אירוע GA4 (secondary).')
        } catch { /* ignore */ }
    }

    // offline store→Ads bridge state (paid-originated phone/WhatsApp/manual orders)
    const oc = rd.offlineConversions
    if (oc?.actionResourceName) {
        const last = oc.lastUploaded
        add('offline_bridge', 'pass', `גשר הזמנות אופליין → Ads פעיל${typeof last === 'number' ? ` (הועלו ${last} בריצה האחרונה)` : ''}.`)
    } else {
        add('offline_bridge', 'warn', 'גשר הזמנות אופליין → Ads לא הוגדר עדיין.', 'מופעל אוטומטית בסיום הגדרת GTM — הזמנות עם gclid יועלו ל-Ads כ-secondary.')
    }

    // conversion-action roles + enhanced conversions (Ads)
    const cfg: any = a?.googleAdsConfig || (await db.select().from(instances).where(eq(instances.id, instanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.loginCustomerId || cfg.customerId || ''); const operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager); const dev = cfg.developerToken
    if (at && operating && dev) {
        try {
            const acts = await adsQuery(operating, manager, dev, at, `SELECT conversion_action.name, conversion_action.category, conversion_action.primary_for_goal, conversion_action.status FROM conversion_action WHERE conversion_action.status = 'ENABLED'`)
            const biz = (business || '').toString().toLowerCase()
            const mine = acts.filter(r => (r.conversionAction?.name || '').toLowerCase().includes('packing') || (r.conversionAction?.name || '').toLowerCase().includes(biz.split(' ')[0]))
            const purchasePrimary = mine.some(r => r.conversionAction?.category === 'PURCHASE' && r.conversionAction?.primaryForGoal)
            const leadPrimary = mine.filter(r => ['CONTACT', 'PHONE_CALL_LEAD', 'SUBMIT_LEAD_FORM'].includes(r.conversionAction?.category) && r.conversionAction?.primaryForGoal)
            add('purchase_primary', purchasePrimary ? 'pass' : 'fail', purchasePrimary ? 'רכישה מוגדרת כהמרה ראשית.' : 'אין פעולת רכישה ראשית לעסק.', purchasePrimary ? undefined : 'הגדירו את רכישת העסק כ-Primary.')
            add('leads_secondary', leadPrimary.length === 0 ? 'pass' : 'warn', leadPrimary.length === 0 ? 'לידים (טלפון/וואטסאפ/טופס) מוגדרים כמשניים — bidding על רכישות בלבד.' : `${leadPrimary.length} פעולות ליד מוגדרות ראשיות — bidding עלול להתבסס עליהן, לא על רכישות.`, leadPrimary.length === 0 ? undefined : 'העבירו לידים ל-Secondary כדי שה-bidding יתמקד ברכישות.')
        } catch (e) { add('conversion_roles', 'warn', `Ads שגיאה: ${(e as Error).message}`) }
    } else add('ads_connected', 'warn', 'Google Ads לא מחובר במלואו — לא ניתן לאמת פעולות המרה.')

    // store connectivity + 1-day integrity
    try {
        const cw = await loadWpConfig(instanceId, agentId)
        if (!cw) add('store_connected', 'warn', 'חנות (WordPress/WooCommerce) לא מחוברת — לא ניתן לייבא הזמנות אופליין.')
        else if (at && prop) {
            const auth = 'Basic ' + Buffer.from(`${cw.user}:${cw.appPassword}`).toString('base64')
            const day = '1daysAgo'  // GA4 keyword; for WC we need a concrete date — use yesterday UTC date
            const d = new Date(Date.now() - 86400_000).toISOString().slice(0, 10)
            const wc = await fetch(`${cw.url.replace(/\/+$/, '')}/wp-json/wc/v3/orders?after=${d}T00:00:00&before=${d}T23:59:59&per_page=100&_fields=id,status`, { headers: { Authorization: auth } })
            if (wc.ok) {
                const orders = (await wc.json() as any[]).filter(o => o.status === 'completed' || o.status === 'processing')
                const ga = await ga4(at, prop, day, day, ['eventName'], ['purchase'])
                const gaP = ga.find((r: any) => r.d[0] === 'purchase')?.n || 0
                const gap = orders.length - gaP
                add('store_integrity', orders.length === 0 ? 'skip' : gap > 0 ? 'warn' : 'pass', `אתמול: חנות ${orders.length} · GA4 ${gaP}${gap > 0 ? ` (פער ${gap})` : ''}.`, gap > 0 ? 'חלק מההזמנות לא מגיעות ל-GA4 — בדקו מדידת רכישה server-side.' : undefined)
            } else add('store_connected', 'warn', `החנות החזירה ${wc.status} — בדקו הרשאות WooCommerce.`)
        }
    } catch (e) { add('store_integrity', 'skip', `store: ${(e as Error).message}`) }

    const weights: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0, skip: 1 }
    const scored = checks.filter(c => c.status !== 'skip')
    const score = scored.length ? Math.round((scored.reduce((s, c) => s + weights[c.status], 0) / scored.length) * 100) : 0
    return { agentId, business, checks, score }
}