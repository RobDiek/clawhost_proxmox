/**
 * Site Performance (Core Web Vitals) — propose-only. Runs Google PageSpeed
 * Insights on the tenant's site, extracts the field/lab CWV + the top
 * opportunities (incl. third-party iframes), and produces a concrete Hebrew
 * action proposal. Read-only — does NOT edit the site (safe-by-design; theme
 * edits stay a reviewed decision).
 */
import { loadWpConfig } from '@/services/seoMetaBatch'
import { loadGithubConfig } from '@/services/seoGithubBatch'

const PSI = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

export interface SitePerfResult {
    ok: boolean
    url?: string
    error?: string
    cwv: { metric: string; value: string; rating: string }[]
    opportunities: { title: string; savingsMs?: number }[]
    iframes: number
    proposalHe: string
}

async function resolveSiteUrl(instanceId: string, agentId?: string | null): Promise<string | null> {
    try {
        const { db } = await import('@/db'); const { matehAgents } = await import('@/db/schema'); const { eq } = await import('drizzle-orm')
        const [row] = agentId ? await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) : []
        const rd: any = (row?.researchData as any) || {}
        const u = rd?.answers?.websiteUrl || rd?.answers?.website || rd?.answers?.site || rd?.paidProfile?.siteUrl
        if (u) return String(u)
    } catch { /* */ }
    const wp = await loadWpConfig(instanceId, agentId) as { url: string } | null
    if (wp?.url) return wp.url
    const gh = await loadGithubConfig(instanceId, agentId)
    if ((gh as any)?.siteUrl) return (gh as any).siteUrl
    return null
}

export async function runSitePerf(instanceId: string, opts: { agentId?: string | null } = {}): Promise<SitePerfResult> {
    const result: SitePerfResult = { ok: false, cwv: [], opportunities: [], iframes: 0, proposalHe: '' }
    let url = await resolveSiteUrl(instanceId, opts.agentId)
    if (!url) { result.error = 'no site URL'; return result }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    result.url = url

    const key = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_API_KEY || ''
    const psiUrl = `${PSI}?url=${encodeURIComponent(url)}&strategy=mobile&category=performance${key ? `&key=${key}` : ''}`
    let data: any
    try {
        const res = await fetch(psiUrl, { signal: AbortSignal.timeout(60000) })
        data = await res.json()
        if (!res.ok) { result.error = `PSI ${res.status}: ${data?.error?.message || ''}`.slice(0, 200); return result }
    } catch (e) { result.error = `PSI: ${(e as Error).message}`; return result }

    // Field CWV (CrUX) if available, else lab
    const fe = data.loadingExperience?.metrics || {}
    const rate = (c: string) => c === 'FAST' ? 'טוב' : c === 'AVERAGE' ? 'בינוני' : 'נדרש שיפור'
    const push = (k: string, label: string, unit: string) => { const m = fe[k]; if (m) result.cwv.push({ metric: label, value: `${m.percentile}${unit}`, rating: rate(m.category) }) }
    push('LARGEST_CONTENTFUL_PAINT_MS', 'LCP', 'ms')
    push('INTERACTION_TO_NEXT_PAINT', 'INP', 'ms')
    push('CUMULATIVE_LAYOUT_SHIFT_SCORE', 'CLS', '')
    const lh = data.lighthouseResult || {}
    const perfScore = Math.round((lh.categories?.performance?.score ?? 0) * 100)
    const audits = lh.audits || {}
    for (const id of Object.keys(audits)) {
        const a = audits[id]
        const ms = a?.details?.overallSavingsMs || a?.numericValue
        if (a?.score !== null && a?.score < 0.9 && (a?.details?.type === 'opportunity') && ms > 150) {
            result.opportunities.push({ title: a.title, savingsMs: Math.round(ms) })
        }
    }
    result.opportunities.sort((a, b) => (b.savingsMs || 0) - (a.savingsMs || 0))
    result.opportunities = result.opportunities.slice(0, 6)
    // third-party iframes (the plan's "הסרת iframes")
    const tp = audits['third-party-summary']?.details?.items || []
    result.iframes = Array.isArray(tp) ? tp.length : 0

    const cwvLine = result.cwv.length ? result.cwv.map(c => `${c.metric} ${c.value} (${c.rating})`).join(' · ') : 'אין נתוני שדה (CrUX) — תנועה נמוכה מדי; נעזר בנתוני מעבדה.'
    const oppLines = result.opportunities.map(o => `• ${o.title}${o.savingsMs ? ` — חיסכון ~${(o.savingsMs / 1000).toFixed(1)} שנ'` : ''}`).join('\n') || '• אין הזדמנויות משמעותיות'
    result.proposalHe = `ציון ביצועים (מובייל): ${perfScore}/100.\nליבת חוויית משתמש: ${cwvLine}\n\nהזדמנויות שיפור מובילות:\n${oppLines}\n\n${result.iframes ? `זוהו ${result.iframes} סקריפטים/iframes של צד-שלישי — מועמדים להסרה/דחייה (defer).` : ''}\nהמלצה: יישום זה דורש שינויים בתבנית/בסקריפטים — בצעו לאחר אישור (שינוי קוד אתר אינו אוטומטי מטעמי בטיחות).`
    result.ok = true
    return result
}