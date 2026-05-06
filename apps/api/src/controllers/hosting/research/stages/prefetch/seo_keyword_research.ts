/**
 * DataForSEO pre-fetch for seo_keyword_research stage.
 *
 * Premium tier (per playbook §17): goes broad with 700 keyword ideas +
 * bulk difficulty calibration + SERP-with-features for top 10 priority
 * candidates + striking-distance scan if we have a domain.
 *
 * Seeds: derived from answers.targetKeywords (user-curated) when present,
 * else fallback to businessName + product names + extracted noun tokens
 * from businessDescription. Cap = 10 seeds (DFS allows 200 but cost
 * scales; 10 covers most cases since each seed expands to ~70 ideas).
 *
 * Hard-fail strategy:
 *   - PRIMARY: keywordIdeas (the bread-and-butter call) — DfsError bubbles up
 *   - SECONDARY: keywordDifficulty bulk, serpAdvanced top-10, rankedKeywords —
 *     best-effort. Per-call failures logged, stage proceeds with partial data.
 */

import {
    keywordIdeas,
    keywordDifficulty,
    serpAdvanced,
    rankedKeywords,
    parseSerpFeatures,
    LOCATION_IL,
    DfsError,
    type KeywordIdeasItem,
    type KeywordDifficultyItem,
    type RankedKeywordItem,
    type SerpResult,
} from '@/services/research/dataforseo'
import { decideLanguage } from '@/services/research/methodology'
import type { ResearchDataV2 } from '@/services/research/types'

export interface SerpSnapshot {
    keyword: string
    /** Parsed SERP feature flags + organic top-3 + PAA + AIO citations */
    features: ReturnType<typeof parseSerpFeatures>
    rawItemsCount: number
}

export interface SeoKeywordResearchDfsData {
    ourDomain: string | null
    seeds: string[]
    languageCode: 'he' | 'en'
    /** 700 keyword candidates from keyword_ideas — volumes/CPC/competition/intent */
    ideas: KeywordIdeasItem[]
    /** Calibrated keyword_difficulty for top 100 ideas (by volume) */
    difficulty: KeywordDifficultyItem[]
    /** SERP feature snapshots for top 10 priority candidates */
    serpSnapshots: SerpSnapshot[]
    /** Keywords our domain currently ranks for (positions 1-100) — striking-distance source */
    rankedKeywords: RankedKeywordItem[]
    /** Best-effort failure log for the prompt to report honestly */
    enrichmentMissing: string[]
    totalCostUsd: number
    cacheHits: number
    cacheMisses: number
}

export async function prefetchSeoKeywordResearch(
    instanceId: string,
    rd: ResearchDataV2,
): Promise<SeoKeywordResearchDfsData> {
    const answers = (rd.answers || {}) as Record<string, unknown>
    const businessName = String(answers.businessName || '').trim()
    const websiteUrl = String(answers.websiteUrl || '').trim()

    const lang = decideLanguage({
        business_type: 'mixed',  // simplified — keyword research benefits from broad seeds
        delivery_locality: 'il_national',
        research_corpus: 'mixed',
        trust_heavy: false,
        tech_persona: false,
    })
    const languageCode: 'he' | 'en' = lang.primary === 'en' ? 'en' : 'he'

    // ─── Derive seeds ──
    // Priority: user-curated targetKeywords → product names → business name → extracted noun tokens.
    const seeds = deriveSeeds(answers, businessName)

    let ourDomain: string | null = null
    if (websiteUrl) {
        try {
            const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)
            ourDomain = u.hostname.replace(/^www\./, '')
        } catch { ourDomain = null }
    }

    let totalCostUsd = 0
    let cacheHits = 0
    let cacheMisses = 0
    const enrichmentMissing: string[] = []
    const trackCall = <T>(r: { cost: number; cached: boolean; items: T[] }) => {
        totalCostUsd += r.cost
        if (r.cached) cacheHits++
        else cacheMisses++
        return r
    }

    // ─── PRIMARY: keyword ideas (700 candidates). Hard-fail. ──
    let ideas: KeywordIdeasItem[] = []
    try {
        const r = await keywordIdeas(instanceId, seeds, {
            location_code: LOCATION_IL,
            language_code: languageCode,
            limit: 700,
            include_serp_info: true,
        })
        trackCall(r)
        ideas = r.items
    } catch (err) {
        if (err instanceof DfsError) throw err
        throw new DfsError(
            'task_failed',
            `שגיאה ב-DataForSEO keyword_ideas: ${(err as Error).message}`,
        )
    }

    // ─── SECONDARY: difficulty bulk for top 100 ideas by volume ──
    const top100ByVolume = [...ideas]
        .filter(k => typeof k.keyword_info?.search_volume === 'number')
        .sort((a, b) => (b.keyword_info?.search_volume || 0) - (a.keyword_info?.search_volume || 0))
        .slice(0, 100)
        .map(k => k.keyword)

    let difficulty: KeywordDifficultyItem[] = []
    if (top100ByVolume.length > 0) {
        try {
            const r = await keywordDifficulty(instanceId, top100ByVolume, {
                location_code: LOCATION_IL,
                language_code: languageCode,
            })
            trackCall(r)
            difficulty = r.items
        } catch (err) {
            enrichmentMissing.push('keyword_difficulty')
            console.warn(`[prefetch/seo_keyword_research] difficulty bulk failed:`, (err as Error).message)
        }
    }

    // ─── SECONDARY: SERP snapshots for top 10 priority candidates ──
    // Priority = top 10 by volume from the difficulty-calibrated set.
    const top10ForSerp = top100ByVolume.slice(0, 10)
    const serpSnapshots: SerpSnapshot[] = []
    const serpResults = await Promise.allSettled(
        top10ForSerp.map(kw => serpAdvanced(instanceId, kw, {
            location_code: LOCATION_IL,
            language_code: languageCode,
            device: 'mobile',
            depth: 50,
        }))
    )
    for (let i = 0; i < serpResults.length; i++) {
        const res = serpResults[i]
        if (res.status === 'fulfilled') {
            trackCall(res.value)
            const serp = res.value.items[0] as SerpResult | undefined
            if (serp) {
                serpSnapshots.push({
                    keyword: top10ForSerp[i],
                    features: parseSerpFeatures(serp),
                    rawItemsCount: serp.items_count || 0,
                })
            }
        } else {
            console.warn(`[prefetch/seo_keyword_research] SERP ${top10ForSerp[i]} failed:`, (res.reason as Error).message)
        }
    }
    if (serpSnapshots.length === 0 && top10ForSerp.length > 0) {
        enrichmentMissing.push('serp_advanced')
    }

    // ─── SECONDARY: striking-distance scan via rankedKeywords for our domain ──
    let ranked: RankedKeywordItem[] = []
    if (ourDomain) {
        try {
            const r = await rankedKeywords(instanceId, ourDomain, {
                location_code: LOCATION_IL,
                language_code: languageCode,
                limit: 100,
                filters: [
                    // Position 1-50 — covers fast/upgrade/rebuild buckets per playbook §9
                    ['ranked_serp_element.serp_item.rank_absolute', '<=', 50],
                ],
            })
            trackCall(r)
            ranked = r.items
        } catch (err) {
            enrichmentMissing.push('ranked_keywords')
            console.warn(`[prefetch/seo_keyword_research] ranked_keywords failed:`, (err as Error).message)
        }
    }

    console.log(`[prefetch/seo_keyword_research] cost=$${totalCostUsd.toFixed(4)} cache=${cacheHits}/${cacheHits + cacheMisses} ideas=${ideas.length} difficulty=${difficulty.length} serp=${serpSnapshots.length} ranked=${ranked.length}`)

    return {
        ourDomain,
        seeds,
        languageCode,
        ideas,
        difficulty,
        serpSnapshots,
        rankedKeywords: ranked,
        enrichmentMissing,
        totalCostUsd,
        cacheHits,
        cacheMisses,
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ProductLike { name?: string }

function deriveSeeds(answers: Record<string, unknown>, businessName: string): string[] {
    const seeds = new Set<string>()

    // 1. User-curated keyword hints (highest priority)
    const userHints = answers.targetKeywords
    if (typeof userHints === 'string') {
        userHints.split(/[,\n]/).map(s => s.trim()).filter(Boolean).forEach(s => seeds.add(s))
    } else if (Array.isArray(userHints)) {
        for (const h of userHints) if (typeof h === 'string' && h.trim()) seeds.add(h.trim())
    }

    // 2. Product names
    const products = answers.products
    if (Array.isArray(products)) {
        for (const p of products as ProductLike[]) {
            if (p?.name && typeof p.name === 'string' && p.name.trim()) seeds.add(p.name.trim())
        }
    }

    // 3. Business name
    if (businessName) seeds.add(businessName)

    // 4. Description noun-token fallback if we still don't have enough
    if (seeds.size < 3) {
        const desc = String(answers.businessDescription || '').trim()
        const tokens = extractCandidateTokens(desc).slice(0, 5)
        for (const t of tokens) seeds.add(t)
    }

    const list = Array.from(seeds).slice(0, 10)
    if (list.length === 0) {
        // Truly empty answers — fall back to category guess from any text.
        list.push(businessName || 'business')
    }
    return list
}

/**
 * Naive Hebrew/English token extractor — splits on whitespace and punctuation,
 * drops stopwords + short tokens. NOT a real NLP — just enough to seed DFS
 * when user didn't provide better signal. Real NLP belongs in the agent's
 * synthesis step, not in prefetch heuristics.
 */
function extractCandidateTokens(text: string): string[] {
    if (!text) return []
    const HE_STOPWORDS = new Set(['של', 'את', 'עם', 'גם', 'או', 'אבל', 'מ', 'ב', 'ל', 'אנחנו', 'שלנו', 'יש', 'הוא', 'היא', 'זה', 'את'])
    const EN_STOPWORDS = new Set(['the', 'and', 'for', 'our', 'with', 'are', 'you', 'your', 'we', 'is', 'an', 'in', 'on', 'at', 'to', 'of', 'from', 'by'])
    const tokens = text
        .replace(/[.,;:!?\-—()[\]{}"']/g, ' ')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length >= 3)
        .filter(t => !HE_STOPWORDS.has(t) && !EN_STOPWORDS.has(t.toLowerCase()))
    // Dedupe preserving order
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of tokens) {
        const key = t.toLowerCase()
        if (!seen.has(key)) { seen.add(key); out.push(t) }
    }
    return out
}