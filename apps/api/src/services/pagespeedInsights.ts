// Google PageSpeed Insights — public API for landing page speed/quality.
//
// Used in Mazhir audit because Quality Score factors heavily on landing page
// experience. Slow LP → high CPC, low ad position. We pull Core Web Vitals
// (LCP, INP, CLS) + performance score for the customer's site.
//
// Auth: optional API key via env PAGESPEED_API_KEY (free 25K/day without).
// We always use mobile strategy — Google's primary index since 2020.

interface PSIScores {
    performance: number             // 0-100
    accessibility: number
    bestPractices: number
    seo: number
}

interface PSICoreWebVitals {
    lcp: { ms: number; rating: 'good' | 'needs-improvement' | 'poor' }       // Largest Contentful Paint
    inp: { ms: number; rating: 'good' | 'needs-improvement' | 'poor' }       // Interaction to Next Paint
    cls: { value: number; rating: 'good' | 'needs-improvement' | 'poor' }    // Cumulative Layout Shift
    fcp?: { ms: number }
    ttfb?: { ms: number }
}

interface PSIResult {
    available: boolean
    reason?: string
    url?: string
    strategy: 'mobile' | 'desktop'
    scores?: PSIScores
    cwv?: PSICoreWebVitals
    topOpportunities: Array<{ id: string; title: string; savingsMs: number }>
    overallRating: 'critical' | 'poor' | 'good' | 'excellent'
}

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

export async function enrichWithPageSpeed(
    siteUrl: string | null | undefined,
    strategy: 'mobile' | 'desktop' = 'mobile',
): Promise<PSIResult> {
    if (!siteUrl) {
        return { available: false, reason: 'No site URL', strategy, topOpportunities: [], overallRating: 'critical' }
    }
    const apiKey = process.env.PAGESPEED_API_KEY || ''
    const params = new URLSearchParams({
        url: siteUrl,
        strategy,
        category: 'performance',
    })
    if (apiKey) params.append('key', apiKey)
    // Add the four lighthouse categories in separate `category` params
    const url = `${ENDPOINT}?${params.toString()}&category=accessibility&category=best-practices&category=seo`

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(45_000) })
        const j = await res.json() as {
            lighthouseResult?: {
                categories?: Record<string, { score?: number }>
                audits?: Record<string, { numericValue?: number; displayValue?: string; details?: any }>
            }
            error?: { message?: string }
        }
        if (j.error) {
            return { available: false, reason: `PSI: ${j.error.message}`, strategy, topOpportunities: [], overallRating: 'critical' }
        }
        const lh = j.lighthouseResult
        if (!lh) {
            return { available: false, reason: 'PSI returned no lighthouse data', strategy, topOpportunities: [], overallRating: 'critical' }
        }
        const cats = lh.categories || {}
        const scores: PSIScores = {
            performance: Math.round(((cats.performance?.score) || 0) * 100),
            accessibility: Math.round(((cats.accessibility?.score) || 0) * 100),
            bestPractices: Math.round(((cats['best-practices']?.score) || 0) * 100),
            seo: Math.round(((cats.seo?.score) || 0) * 100),
        }
        const audits = lh.audits || {}
        const num = (k: string) => audits[k]?.numericValue ?? 0
        const lcp = num('largest-contentful-paint')
        const inp = num('interactive') || num('interaction-to-next-paint')
        const cls = num('cumulative-layout-shift')
        const fcp = num('first-contentful-paint')
        const ttfb = num('server-response-time')
        function rate(ms: number, good: number, poor: number): 'good' | 'needs-improvement' | 'poor' {
            if (ms <= good) return 'good'
            if (ms <= poor) return 'needs-improvement'
            return 'poor'
        }
        function rateCls(v: number): 'good' | 'needs-improvement' | 'poor' {
            if (v <= 0.1) return 'good'
            if (v <= 0.25) return 'needs-improvement'
            return 'poor'
        }
        const cwv: PSICoreWebVitals = {
            lcp: { ms: Math.round(lcp), rating: rate(lcp, 2500, 4000) },
            inp: { ms: Math.round(inp), rating: rate(inp, 200, 500) },
            cls: { value: Number(cls.toFixed(3)), rating: rateCls(cls) },
            fcp: { ms: Math.round(fcp) },
            ttfb: { ms: Math.round(ttfb) },
        }
        // Top opportunities (audits with savingsMs > 100)
        const opportunities = Object.entries(audits)
            .map(([id, a]) => ({ id, title: (a as any).title || id, savingsMs: ((a.details && (a.details as any).overallSavingsMs) || 0) }))
            .filter(o => o.savingsMs >= 100)
            .sort((a, b) => b.savingsMs - a.savingsMs)
            .slice(0, 5)

        const ratingFromScore = (s: number): PSIResult['overallRating'] => {
            if (s >= 90) return 'excellent'
            if (s >= 75) return 'good'
            if (s >= 50) return 'poor'
            return 'critical'
        }

        return {
            available: true,
            url: siteUrl,
            strategy,
            scores,
            cwv,
            topOpportunities: opportunities,
            overallRating: ratingFromScore(scores.performance),
        }
    } catch (err) {
        return { available: false, reason: `PSI fetch failed: ${(err as Error).message}`, strategy, topOpportunities: [], overallRating: 'critical' }
    }
}

export function renderPageSpeedContext(r: PSIResult): string {
    if (!r.available || !r.scores || !r.cwv) {
        return `═══ PAGESPEED INSIGHTS — LANDING PAGE QUALITY ═══\n\n(${r.reason || 'no data'})`
    }
    const cwv = r.cwv
    const opps = r.topOpportunities.slice(0, 5).map(o => `  - ${o.title} (savings: ${(o.savingsMs / 1000).toFixed(1)}s)`).join('\n')
    return `═══ PAGESPEED INSIGHTS — LANDING PAGE QUALITY (mobile, ${r.url}) ═══

Overall: ${r.overallRating.toUpperCase()} (perf=${r.scores.performance}, a11y=${r.scores.accessibility}, BP=${r.scores.bestPractices}, SEO=${r.scores.seo})

Core Web Vitals:
  LCP: ${cwv.lcp.ms}ms (${cwv.lcp.rating})
  INP: ${cwv.inp.ms}ms (${cwv.inp.rating})
  CLS: ${cwv.cls.value} (${cwv.cls.rating})
  FCP: ${cwv.fcp?.ms ?? '?'}ms · TTFB: ${cwv.ttfb?.ms ?? '?'}ms

${opps ? 'Top performance opportunities:\n' + opps : ''}

USE THIS DATA in your audit:
  - performance < 50 → flag as CRITICAL Quality Score blocker. Slow LP = high CPC, low rank.
  - LCP > 4000ms or INP > 500ms → "poor" CWV → Google Ads will boost CPC by 10-30%.
  - If overall=poor/critical, recommend LP fixes BEFORE bid optimization — bid tuning on slow LP is throwing money away.`
}