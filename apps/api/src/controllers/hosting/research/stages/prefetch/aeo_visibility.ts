/**
 * Pre-fetch for aeo_visibility stage. Phase E1.1.
 *
 * AEO (Answer Engine Optimization) is "do we get cited when someone asks
 * an LLM about our category?" plus "is our content extractable enough for
 * an LLM to lift facts cleanly?". This stage produces actionable answers
 * to both questions.
 *
 * Inputs (read from upstream stages — fail clearly if missing):
 *   - internal_seo_audit  → schema coverage by page-type + URL inventory
 *   - seo_keyword_research → top take_now / commercial_eval queries to probe
 *
 * Calls:
 *   1. Anthropic citation probes — for each top 5 priority query, ask Claude
 *      "what's the best <category> in Israel?" and parse the response for
 *      our brand vs competitor mentions. Surfaces "do AI tools recommend us?"
 *   2. (Optional, skipped in MVP) GSC AI Overview impression breakdown —
 *      requires GSC SearchAnalytics with searchAppearance dimension which
 *      the API exposes inconsistently. Deferred to Phase E2.
 *
 * Outputs:
 *   - Per-query citation result (we mentioned / position / context / who else)
 *   - Aggregate: citation_rate, top competitors that ARE cited
 *   - Schema gap analysis cross-referenced with AEO requirements
 *   - Extractability score per top URL
 */

import { getApiKeyForInstance } from '@/controllers/hosting/agentSetup'
import type { ResearchDataV2 } from '@/services/research/types'

interface UpstreamUrlEntry {
    url: string
    inferredPageType?: string
    schemaTypes?: string[]
    h1List?: string[]
    wordCount?: number
}

interface UpstreamKwRecord {
    keyword?: string
    intent?: { primary?: string }
    opportunity?: { decision?: string; total?: number }
    aeo?: { is_priority?: boolean; total?: number }
    cluster?: string
}

export interface AeoCitationProbe {
    /** The query we asked Claude */
    query: string
    /** The keyword from seo_keyword_research that we probed (drives intent context) */
    sourceKeyword: string
    /** Did our brand appear in the response? */
    brandCited: boolean
    /** Position of first mention (1 = first recommendation, 99 = not cited at all) */
    brandPosition: number | null
    /** Other domains/brands mentioned in order */
    competitorsCited: string[]
    /** 1-2 sentence excerpt around the brand mention (or first line if not cited) */
    excerpt: string
    /** Our brand was mentioned with positive/neutral/negative sentiment */
    sentiment: 'positive' | 'neutral' | 'negative' | 'not_cited'
}

export interface AeoVisibilityDfsData {
    ourDomain: string | null
    /** Did we have upstream context to work from? */
    hasUpstream: boolean
    upstreamMissing: string[]
    /** Top URLs from internal_seo_audit (sample) */
    topUrls: UpstreamUrlEntry[]
    /** Top priority queries from seo_keyword_research */
    priorityKeywords: UpstreamKwRecord[]
    /** Per-query citation results */
    citationProbes: AeoCitationProbe[]
    /** Aggregated: out of N probes, in how many were we cited */
    citationStats: {
        probes_run: number
        brand_cited_count: number
        brand_cited_pct: number
        avg_brand_position: number | null
        most_cited_competitor: string | null
        competitor_citation_frequency: Record<string, number>
    }
    /** Schema gap from internal audit — but mapped to AEO requirements */
    aeoSchemaGaps: Array<{
        schema_type: string
        why_critical_for_aeo: string
        urls_affected_count: number
    }>
    /** Phase 2026.01 — multi-engine probing layer. Currently ships
     *  google_aio (via DFS SERP) and claude (via Anthropic API). Other
     *  engines (chatgpt/perplexity/bing_copilot) are placeholder entries.
     *  This data SUPPLEMENTS (does not replace) the legacy citationProbes
     *  array above. The augmenter merges both views into the LLM prompt
     *  context. */
    aeoEngineResults?: Array<{
        engine: string
        keywords: string[]
        cited_count: number
        citation_share_pct: number
        total_cost_usd: number
        duration_ms: number
        sample_citations: Array<{ keyword: string; cited_us: boolean; top_competitors: string[] }>
    }>
    totalCostUsd: number
    enrichmentMissing: string[]
}

export async function prefetchAeoVisibility(
    instanceId: string,
    rd: ResearchDataV2,
): Promise<AeoVisibilityDfsData> {
    const answers = (rd.answers || {}) as Record<string, unknown>
    const businessName = String(answers.businessName || '').trim()
    const businessDesc = String(answers.businessDescription || '').trim()
    const websiteUrl = String(answers.websiteUrl || '').trim()

    let ourDomain: string | null = null
    if (websiteUrl) {
        try {
            const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)
            ourDomain = u.hostname.replace(/^www\./, '')
        } catch { ourDomain = null }
    }

    const enrichmentMissing: string[] = []
    const upstreamMissing: string[] = []

    // ─── Read upstream: internal_seo_audit
    const internalAudit = rd.results?.internal_seo_audit
    let topUrls: UpstreamUrlEntry[] = []
    if (internalAudit?.records && Array.isArray(internalAudit.records)) {
        topUrls = (internalAudit.records as Array<Record<string, unknown>>)
            .map(r => ({
                url: String(r.url || ''),
                inferredPageType: r.page_type as string | undefined,
                schemaTypes: (r.schemas_present as string[] | undefined) || [],
                h1List: r.h1 ? [String(r.h1)] : [],
                wordCount: typeof r.word_count === 'number' ? r.word_count : undefined,
            }))
            .filter(u => u.url)
            .slice(0, 20)
    } else {
        upstreamMissing.push('internal_seo_audit')
    }

    // ─── Read upstream: seo_keyword_research
    const kwResearch = rd.results?.seo_keyword_research
    let priorityKeywords: UpstreamKwRecord[] = []
    if (kwResearch?.records && Array.isArray(kwResearch.records)) {
        const all = kwResearch.records as UpstreamKwRecord[]
        // Priority for citation probes: AEO-priority + take_now first; commercial_eval intent preferred.
        const ranked = [...all].sort((a, b) => {
            const aIsPri = a.aeo?.is_priority || a.opportunity?.decision === 'take_now' ? 1 : 0
            const bIsPri = b.aeo?.is_priority || b.opportunity?.decision === 'take_now' ? 1 : 0
            if (aIsPri !== bIsPri) return bIsPri - aIsPri
            return (b.opportunity?.total || 0) - (a.opportunity?.total || 0)
        })
        priorityKeywords = ranked.slice(0, 5)
    } else {
        upstreamMissing.push('seo_keyword_research')
    }

    const hasUpstream = upstreamMissing.length === 0

    // ─── Run Anthropic citation probes (skip if no upstream queries)
    const citationProbes: AeoCitationProbe[] = []
    let totalCostUsd = 0
    if (priorityKeywords.length > 0 && businessName) {
        const apiKey = await getApiKeyForInstance(instanceId)
        if (!apiKey) {
            enrichmentMissing.push('no_anthropic_api_key')
        } else {
            for (const kw of priorityKeywords) {
                const probe = await runCitationProbe(apiKey, businessName, businessDesc, ourDomain, kw)
                citationProbes.push(probe)
                // Each probe ~500-1000 tokens output @ Sonnet pricing — rough est.
                totalCostUsd += 0.005
            }
        }
    } else if (priorityKeywords.length === 0) {
        enrichmentMissing.push('no_priority_keywords')
    }

    // ─── Aggregate stats
    const citationStats = computeCitationStats(citationProbes)

    // ─── Schema gap analysis cross-referenced with AEO requirements
    const aeoSchemaGaps = computeAeoSchemaGaps(topUrls)

    // ─── Phase 2026.01 — multi-engine AEO probing (additive)
    // Currently runs google_aio (DFS SERP advanced — cheap, cached) +
    // claude (Haiku-4.5, recognition probing without web). Other
    // engines (chatgpt/perplexity/bing_copilot) deferred to 2026.02.
    let aeoEngineResults: NonNullable<AeoVisibilityDfsData['aeoEngineResults']> = []
    if (ourDomain && priorityKeywords.length > 0) {
        try {
            const { probeBrandVisibility } = await import('@/services/research/aeoProbing')
            const ourIdentifiers = [ourDomain, businessName].filter(s => s && s.length >= 3)
            const kwStrings = priorityKeywords
                .map(k => String((k as Record<string, unknown>).keyword || '').trim())
                .filter(k => k.length > 0)
            const batches = await probeBrandVisibility({
                instanceId,
                ourDomain,
                ourIdentifiers,
                keywords: kwStrings,
                engines: ['google_aio', 'claude'],
                maxProbesPerEngine: 5,
            })
            aeoEngineResults = batches.map(b => ({
                engine: b.engine,
                keywords: b.keywords,
                cited_count: b.results.filter(r => r.cited_us).length,
                citation_share_pct: b.citation_share_pct,
                total_cost_usd: b.total_cost_usd,
                duration_ms: b.duration_ms,
                sample_citations: b.results.slice(0, 5).map(r => ({
                    keyword: r.keyword,
                    cited_us: r.cited_us,
                    top_competitors: r.citations.slice(0, 3).map(c => c.source),
                })),
            }))
            const totalProbeCost = batches.reduce((s, b) => s + b.total_cost_usd, 0)
            totalCostUsd += totalProbeCost
            console.log(`[prefetch/aeo_visibility] multi-engine probes: ${batches.map(b => `${b.engine}=${b.citation_share_pct}%`).join(', ')} (+$${totalProbeCost.toFixed(4)})`)
        } catch (err) {
            console.warn(`[prefetch/aeo_visibility] multi-engine probing failed (non-fatal): ${(err as Error).message}`)
            enrichmentMissing.push('aeo_engine_probing_failed')
        }
    }

    console.log(`[prefetch/aeo_visibility] cost~$${totalCostUsd.toFixed(4)} probes=${citationProbes.length} cited=${citationStats.brand_cited_count}/${citationStats.probes_run} upstream_ok=${hasUpstream}`)

    return {
        ourDomain,
        hasUpstream,
        upstreamMissing,
        topUrls,
        priorityKeywords,
        citationProbes,
        citationStats,
        aeoSchemaGaps,
        aeoEngineResults,
        totalCostUsd,
        enrichmentMissing,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Citation probe — single Anthropic call asking "what's the best X" and
// parsing the response for brand mentions.

async function runCitationProbe(
    apiKey: string,
    businessName: string,
    businessDesc: string,
    ourDomain: string | null,
    kw: UpstreamKwRecord,
): Promise<AeoCitationProbe> {
    const keyword = String(kw.keyword || '').trim()
    const intent = kw.intent?.primary || 'commercial_eval'
    // Build a "consumer asking AI about category" probe.
    // Phrase it as a real consumer query in the same language as the keyword.
    const isHebrew = /[֐-׿]/.test(keyword)
    const probeQuery = isHebrew
        ? `אני מחפש פתרון בנושא "${keyword}" בישראל. מי השחקנים המובילים? מה הייתם ממליצים?`
        : `I'm looking for a solution for "${keyword}" in Israel. Who are the leading providers? What would you recommend?`

    const systemContext = `You are a knowledge assistant. The user is asking for recommendations in a specific category. Provide 5-7 named providers/brands you know about, ordered by what you'd recommend most. For each, briefly explain why. Use the same language as the user's question.`

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',  // Fast + cheap for this audit task
                max_tokens: 800,
                system: systemContext,
                messages: [{ role: 'user', content: probeQuery }],
            }),
            signal: AbortSignal.timeout(60_000),
        })
        if (!res.ok) {
            return notCitedProbe(probeQuery, keyword, `API ${res.status}`)
        }
        const data = await res.json() as { content?: Array<{ text: string }> }
        const responseText = data.content?.[0]?.text || ''
        return parseProbeResponse(probeQuery, keyword, responseText, businessName, ourDomain)
    } catch (err) {
        return notCitedProbe(probeQuery, keyword, (err as Error).message)
    }
}

function parseProbeResponse(
    query: string,
    sourceKeyword: string,
    text: string,
    businessName: string,
    ourDomain: string | null,
): AeoCitationProbe {
    const brandLower = businessName.toLowerCase()
    const domainLower = (ourDomain || '').toLowerCase().replace(/\.[^.]+$/, '')  // strip TLD for fuzzy match
    const textLower = text.toLowerCase()

    // Brand citation detection
    const brandCited = textLower.includes(brandLower) || (domainLower.length > 3 && textLower.includes(domainLower))
    const brandPosition = brandCited ? estimatePosition(text, businessName, ourDomain) : null

    // Extract competitor mentions — naive heuristic: pull capitalized phrases
    // and Hebrew brand-y patterns. We trust the model gave 5-7 named providers
    // so we look for numbered/bulleted list patterns first.
    const competitors = extractMentionedBrands(text, businessName, ourDomain)

    // Sentiment — we look at adjectives near brand mention
    const sentiment = brandCited ? estimateSentiment(text, businessName, ourDomain) : 'not_cited' as const

    // Excerpt — 200 chars around first brand mention, or first 200 of response
    const excerpt = buildExcerpt(text, businessName, ourDomain)

    return {
        query,
        sourceKeyword,
        brandCited,
        brandPosition,
        competitorsCited: competitors,
        excerpt,
        sentiment,
    }
}

function notCitedProbe(query: string, sourceKeyword: string, reason: string): AeoCitationProbe {
    return {
        query,
        sourceKeyword,
        brandCited: false,
        brandPosition: null,
        competitorsCited: [],
        excerpt: `(Probe failed: ${reason})`,
        sentiment: 'not_cited',
    }
}

function estimatePosition(text: string, businessName: string, ourDomain: string | null): number {
    // Count numbered list items before the first brand mention.
    const idx = text.toLowerCase().indexOf(businessName.toLowerCase())
    if (idx < 0 && ourDomain) {
        const dIdx = text.toLowerCase().indexOf(ourDomain.toLowerCase().split('.')[0])
        if (dIdx < 0) return 99
        return countListItemsBefore(text, dIdx)
    }
    return countListItemsBefore(text, idx)
}

function countListItemsBefore(text: string, idx: number): number {
    const before = text.substring(0, idx)
    const matches = before.match(/(?:^|\n)\s*(?:\d+[.)]|\*|-)\s+/g)
    return matches ? matches.length : 99
}

function extractMentionedBrands(text: string, ownBrand: string, ourDomain: string | null): string[] {
    const brands: string[] = []
    const seen = new Set<string>()
    // Phase QA round-6 — Anthropic responses use markdown headings + emojis +
    // bold, with Hebrew/English mix. Real shapes observed in storage-station
    // run (5 probes): "## 1. 🥇 **BoxBee / ארגזי אחסון מודולריים**" /
    // "### 🥇 **Box-it (בוקס-איט)**" / "1. **Naot Storage** — חברה...".
    //
    // Previous regex required list marker IMMEDIATELY before the bold name —
    // but actual markdown has heading marks + emojis + spaces between. Result
    // was 0 real brands extracted, only Hebrew filler phrases like
    // "המלצתי הכללית" leaked through from random bold spans elsewhere in the
    // response.
    //
    // New strategy: match **bold-wrapped name** directly when preceded by ANY
    // line-leading combination of heading marks / list markers / emojis. Then
    // filter candidates with two heuristics:
    //   (a) drop known filler phrases (commentary, not brands)
    //   (b) require Latin letters OR a name-separator (/ or () — real brand
    //       names in IL responses are either Latin/transliterated or have a
    //       Hebrew translation in parens.
    const fillerPhrases = new Set([
        'המלצתי הכללית', 'המלצה כללית', 'המלצתי', 'הכללית', 'איסוף מהבית',
        'גישה עצמאית', 'גישה 24/7', 'אבטחה', 'הטוב ביותר', 'הכי מומלץ',
        'המלצות מובילות', 'השחקנים המובילים', 'המדריך המהיר', 'מומלץ',
    ])
    const listItemRegex = /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\d+[.)]|\*|-)?\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}]*\s*\*\*([^*\n]+?)\*\*/gu
    let m: RegExpExecArray | null
    while ((m = listItemRegex.exec(text)) !== null) {
        const candidate = m[1].trim()
        if (!candidate || candidate.length < 2 || candidate.length > 80) continue
        if (fillerPhrases.has(candidate)) continue
        const hasLatin = /[A-Za-z]/.test(candidate)
        const hasNameSep = /[/(]/.test(candidate)
        if (!hasLatin && !hasNameSep) continue  // pure-Hebrew prose, not a brand
        const lower = candidate.toLowerCase()
        if (lower === ownBrand.toLowerCase()) continue
        if (ourDomain && lower.includes(ourDomain.toLowerCase().split('.')[0])) continue
        if (seen.has(lower)) continue
        seen.add(lower)
        brands.push(candidate)
        if (brands.length >= 10) break
    }
    return brands
}

function estimateSentiment(text: string, businessName: string, ourDomain: string | null): 'positive' | 'neutral' | 'negative' {
    const idx = text.toLowerCase().indexOf(businessName.toLowerCase())
    const target = idx >= 0 ? idx : (ourDomain ? text.toLowerCase().indexOf(ourDomain.toLowerCase().split('.')[0]) : -1)
    if (target < 0) return 'neutral'
    const window = text.substring(Math.max(0, target - 80), Math.min(text.length, target + 200))
    const wl = window.toLowerCase()
    const positive = ['recommend', 'best', 'top', 'leading', 'excellent', 'great', 'מומלץ', 'הטוב', 'מוביל', 'מצוין', 'אמין']
    const negative = ['avoid', 'poor', 'weak', 'limited', 'expensive', 'באמ', 'חלש', 'מוגבל', 'יקר', 'בעייתי']
    let posScore = 0, negScore = 0
    for (const p of positive) if (wl.includes(p)) posScore++
    for (const n of negative) if (wl.includes(n)) negScore++
    if (posScore > negScore) return 'positive'
    if (negScore > posScore) return 'negative'
    return 'neutral'
}

function buildExcerpt(text: string, businessName: string, ourDomain: string | null): string {
    const idx = text.toLowerCase().indexOf(businessName.toLowerCase())
    const target = idx >= 0 ? idx : (ourDomain ? text.toLowerCase().indexOf(ourDomain.toLowerCase().split('.')[0]) : -1)
    if (target < 0) return text.substring(0, 200).trim() + (text.length > 200 ? '…' : '')
    const start = Math.max(0, target - 60)
    const end = Math.min(text.length, target + 200)
    return (start > 0 ? '…' : '') + text.substring(start, end).trim() + (end < text.length ? '…' : '')
}

function computeCitationStats(probes: AeoCitationProbe[]): AeoVisibilityDfsData['citationStats'] {
    const cited = probes.filter(p => p.brandCited)
    const positions = cited.map(p => p.brandPosition).filter(p => typeof p === 'number') as number[]
    const competitorFreq: Record<string, number> = {}
    for (const p of probes) {
        for (const c of p.competitorsCited) {
            competitorFreq[c] = (competitorFreq[c] || 0) + 1
        }
    }
    const sortedComp = Object.entries(competitorFreq).sort((a, b) => b[1] - a[1])
    return {
        probes_run: probes.length,
        brand_cited_count: cited.length,
        brand_cited_pct: probes.length > 0 ? Math.round((cited.length / probes.length) * 100) : 0,
        avg_brand_position: positions.length > 0
            ? Math.round((positions.reduce((s, p) => s + p, 0) / positions.length) * 10) / 10
            : null,
        most_cited_competitor: sortedComp[0]?.[0] || null,
        competitor_citation_frequency: competitorFreq,
    }
}

function computeAeoSchemaGaps(urls: UpstreamUrlEntry[]): AeoVisibilityDfsData['aeoSchemaGaps'] {
    // Critical AEO schemas — schemas that LLMs actively use to extract facts:
    //   FAQPage   → Q/A extraction → direct AI Overview citation
    //   HowTo     → step-by-step extraction
    //   Article   → byline + dateModified for E-E-A-T
    //   Organization → entity disambiguation
    //   Product   → price, rating extraction
    //   LocalBusiness → location/hours extraction
    const aeoSchemas = ['FAQPage', 'HowTo', 'Article', 'Organization', 'Product', 'LocalBusiness'] as const
    const explanations: Record<typeof aeoSchemas[number], string> = {
        FAQPage:       'הכרחי ל-AI Overview ול-People Also Ask — LLMs מציגים תשובה ישירה מתוך FAQPage schema',
        HowTo:         'Step-by-step extraction לתשובות ב-AI Overview ול-rich snippets',
        Article:       'byline + dateModified הם signals של E-E-A-T שדרושים לציטוט',
        Organization:  'entity disambiguation — בלעדיו ה-LLM לא יודע מי המותג שלכם בקנון הידע שלו',
        Product:       'price + rating extraction לאי קומרס queries',
        LocalBusiness: 'location/hours extraction — קריטי ל-near-me + local AI Overview queries',
    }
    return aeoSchemas
        .filter(s => !urls.some(u => (u.schemaTypes || []).some(t => t.toLowerCase().includes(s.toLowerCase()))))
        .map(s => ({
            schema_type: s,
            why_critical_for_aeo: explanations[s],
            urls_affected_count: urls.filter(u => {
                const pt = u.inferredPageType
                if (s === 'FAQPage') return pt === 'faq' || (u.h1List || []).some(h => /\?/.test(h))
                if (s === 'Article') return pt === 'blog_post'
                if (s === 'Organization') return pt === 'homepage' || pt === 'about'
                if (s === 'LocalBusiness') return pt === 'local_page' || pt === 'contact' || pt === 'homepage'
                if (s === 'Product') return pt === 'product'
                return false
            }).length,
        }))
        .filter(gap => gap.urls_affected_count > 0)
}