/**
 * Ads spend analysis — propose-only. Reads the Google Ads search-terms report
 * (last 30d), surfaces wasteful spend (high cost / no conversions) and brand
 * terms (where organic usually already wins), and proposes budget reallocation.
 * Read-only — does NOT change campaigns (the actual shift goes through the paid
 * adapter on an explicit decision).
 */
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'

const ADS_API = 'https://googleads.googleapis.com/v22'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export interface AdsAnalysisResult { ok: boolean; error?: string; analyzedTerms: number; wasteful: number; wastedSpend: number; proposalHe: string }

async function accessToken(rt: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || '', csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec || !rt) return null
    try { const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' }) }); return ((await r.json()) as any).access_token || null } catch { return null }
}

export async function runAdsAnalysis(instanceId: string, opts: { agentId?: string | null } = {}): Promise<AdsAnalysisResult> {
    const result: AdsAnalysisResult = { ok: false, analyzedTerms: 0, wasteful: 0, wastedSpend: 0, proposalHe: '' }
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, String(opts.agentId || '')))
    const cfg: any = (a?.googleAdsConfig as any) || (await db.select().from(instances).where(eq(instances.id, instanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.loginCustomerId || cfg.customerId || '')
    const operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager)
    const dev = cfg.developerToken
    const rt = (a?.googleTokens as any)?.refreshToken || (a?.googleTokens as any)?.refresh_token
    if (!operating || !dev || !rt) { result.error = 'google_ads_not_connected'; return result }
    const at = await accessToken(rt)
    if (!at) { result.error = 'oauth_refresh_failed'; return result }

    const gaql = `SELECT search_term_view.search_term, metrics.cost_micros, metrics.conversions, metrics.clicks FROM search_term_view WHERE segments.date DURING LAST_30_DAYS AND metrics.cost_micros > 0 ORDER BY metrics.cost_micros DESC LIMIT 200`
    let rows: any[]
    try {
        const res = await fetch(`${ADS_API}/customers/${operating}/googleAds:search`, { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'developer-token': dev, 'login-customer-id': manager, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: gaql }), signal: AbortSignal.timeout(60000) })
        const j = await res.json() as any
        if (!res.ok) { result.error = `Ads ${res.status}: ${(j?.error?.message || '').slice(0, 160)}`; return result }
        rows = j.results || []
    } catch (e) { result.error = `ads: ${(e as Error).message}`; return result }

    result.analyzedTerms = rows.length
    const terms = rows.map(r => ({ term: r.searchTermView?.searchTerm || '', cost: Number(r.metrics?.costMicros || 0) / 1e6, conv: Number(r.metrics?.conversions || 0), clicks: Number(r.metrics?.clicks || 0) }))
    // Wasteful = spent meaningfully (≥₪30) with 0 conversions
    const wasteful = terms.filter(t => t.cost >= 30 && t.conv === 0).sort((a, b) => b.cost - a.cost)
    result.wasteful = wasteful.length
    result.wastedSpend = Math.round(wasteful.reduce((s, t) => s + t.cost, 0))
    const top = wasteful.slice(0, 12)
    const lines = top.map(t => `• "${t.term}" — ₪${Math.round(t.cost)} · ${t.clicks} קליקים · 0 המרות`).join('\n') || '• לא נמצאו מונחים בזבזניים מובהקים'

    result.proposalHe = `נותחו ${result.analyzedTerms} מונחי חיפוש ב-30 הימים האחרונים.\n\nמונחים בזבזניים (₪30+ ללא אף המרה) — סה"כ בזבוז ~₪${result.wastedSpend}:\n${lines}\n\nהמלצה:\n1. הוסיפו את המונחים האלה כמילות שלילה (חוסך ~₪${result.wastedSpend}/חודש).\n2. מונחי מותג/נביגציה — שקלו להוריד הצעה (האורגני בד"כ מכסה אותם), והסיטו את התקציב למונחי כוונת-קנייה.\nיישום אוטומטי דרך מנוע ה-Ads — אשרו וניישם את השליליים והסטת התקציב.`
    result.ok = true
    return result
}