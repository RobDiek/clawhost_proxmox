/**
 * DataForSEO pre-fetch for audience_personas stage.
 *
 * Personas are mostly synthesis from upstream stages (competitor_landscape
 * + seo_keyword_research) + business context. DFS contributes:
 *   - keyword_ideas with intent_info  → reveals what audience searches +
 *     intent classification (informational vs commercial vs transactional)
 *   - trustpilot reviews on top 3 competitors → review-mining for trust
 *     hierarchy + objections + switching costs (per playbook §12)
 *   - GMB profile snapshot for our business → Hebrew review themes
 *
 * Hard-fail strategy:
 *   - PRIMARY: none. This stage is synthesis-heavy; if all DFS calls fail
 *     we still proceed with upstream-stage data + answers, but flag
 *     records as confidence=working_hypothesis per playbook §17 ("if no
 *     interview data, never claim validated").
 *   - SECONDARY: all calls best-effort.
 */

import {
    keywordIdeas,
    trustpilotReviews,
    googleMyBusiness,
    LOCATION_IL,
    type KeywordIdeasItem,
    type TrustpilotReviewItem,
    type GoogleMyBusinessItem,
} from '@/services/research/dataforseo'
import { decideLanguage } from '@/services/research/methodology'
import { getStageContent } from '@/services/research/reader'
import type { ResearchDataV2 } from '@/services/research/types'

export interface CompetitorReviewSnapshot {
    domain: string
    /** Trustpilot reviews — first 30 by recency. Empty if domain not on Trustpilot. */
    reviews: TrustpilotReviewItem[]
}

export interface AudiencePersonasDfsData {
    languageCode: 'he' | 'en'
    /** Intent-rich keyword ideas — used to map JTBD/queries-by-stage per persona */
    intentKeywords: KeywordIdeasItem[]
    /** Trustpilot reviews for top 3 competitors (from upstream stage) */
    competitorReviews: CompetitorReviewSnapshot[]
    /** Our own GMB profile if found — Hebrew review themes */
    ourGmb: GoogleMyBusinessItem | null
    /** Names extracted from upstream — sourced for review mining */
    competitorDomainsUsed: string[]
    enrichmentMissing: string[]
    totalCostUsd: number
    cacheHits: number
    cacheMisses: number
}

export async function prefetchAudiencePersonas(
    instanceId: string,
    rd: ResearchDataV2,
): Promise<AudiencePersonasDfsData> {
    const answers = (rd.answers || {}) as Record<string, unknown>
    const businessName = String(answers.businessName || '').trim()

    const lang = decideLanguage({
        business_type: 'mixed',
        delivery_locality: 'il_national',
        research_corpus: 'mixed',
        trust_heavy: false,
        tech_persona: false,
    })
    const languageCode: 'he' | 'en' = lang.primary === 'en' ? 'en' : 'he'

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

    // ─── Pull upstream competitor list for review mining ──
    // Source priority: competitor_landscape JSON records → records[].url
    // → answers.competitors free-text fallback.
    const competitorDomains = extractTopCompetitorDomains(rd, 3)

    // ─── SECONDARY: intent-rich keyword ideas ──
    // Use a small seed set focused on JTBD/persona language — emotional /
    // problem / "how to / why" terms, not just product keywords. Fallback
    // to businessName if we can't derive better.
    const personaSeeds = derivePersonaSeeds(answers, businessName)
    let intentKeywords: KeywordIdeasItem[] = []
    if (personaSeeds.length > 0) {
        try {
            const r = await keywordIdeas(instanceId, personaSeeds, {
                location_code: LOCATION_IL,
                language_code: languageCode,
                limit: 200,  // smaller than seo_keyword_research — enough for intent mapping
                include_serp_info: false,
            })
            trackCall(r)
            intentKeywords = r.items
        } catch (err) {
            enrichmentMissing.push('keyword_ideas_intent')
            console.warn(`[prefetch/audience_personas] intent keyword_ideas failed:`, (err as Error).message)
        }
    }

    // ─── SECONDARY: Trustpilot reviews for top competitors ──
    const competitorReviews: CompetitorReviewSnapshot[] = []
    const reviewResults = await Promise.allSettled(
        competitorDomains.map(d => trustpilotReviews(instanceId, d, { limit: 30 }))
    )
    for (let i = 0; i < reviewResults.length; i++) {
        const res = reviewResults[i]
        const domain = competitorDomains[i]
        if (res.status === 'fulfilled') {
            trackCall(res.value)
            competitorReviews.push({ domain, reviews: res.value.items })
        } else {
            // Trustpilot 404 (domain not on TP) is the common case — silent skip.
            const msg = (res.reason as Error).message
            if (!/404/.test(msg)) {
                console.warn(`[prefetch/audience_personas] Trustpilot ${domain} failed:`, msg)
            }
        }
    }

    // ─── SECONDARY: GMB for our business — Hebrew review themes ──
    let ourGmb: GoogleMyBusinessItem | null = null
    if (businessName) {
        try {
            const r = await googleMyBusiness(instanceId, businessName, {
                location_code: LOCATION_IL,
                language_code: languageCode,
            })
            trackCall(r)
            ourGmb = r.items[0] || null
        } catch (err) {
            console.warn(`[prefetch/audience_personas] GMB lookup failed:`, (err as Error).message)
        }
    }

    console.log(`[prefetch/audience_personas] cost=$${totalCostUsd.toFixed(4)} cache=${cacheHits}/${cacheHits + cacheMisses} intent_kw=${intentKeywords.length} competitor_reviews=${competitorReviews.length} (from ${competitorDomains.length} candidates)`)

    return {
        languageCode,
        intentKeywords,
        competitorReviews,
        ourGmb,
        competitorDomainsUsed: competitorDomains,
        enrichmentMissing,
        totalCostUsd,
        cacheHits,
        cacheMisses,
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface CompetitorRecordLike { url?: string; name?: string }

/**
 * Extract top N competitor domains from upstream competitor_landscape stage.
 * Falls through to answers.competitors free-text parsing if no records yet.
 */
function extractTopCompetitorDomains(rd: ResearchDataV2, n: number): string[] {
    const out = new Set<string>()

    // Source 1: structured records from competitor_landscape stage
    const compResult = rd.results?.competitor_landscape
    const records = (compResult as { records?: CompetitorRecordLike[] } | undefined)?.records || []
    for (const r of records) {
        if (out.size >= n) break
        const url = r.url
        if (typeof url === 'string') {
            try {
                const u = new URL(url.startsWith('http') ? url : `https://${url}`)
                const host = u.hostname.replace(/^www\./, '')
                if (host) out.add(host)
            } catch { /* skip malformed */ }
        }
    }

    // Source 2: legacy stage1 narrative (during migration window)
    if (out.size < n) {
        const stage1 = getStageContent(rd, 'competitor_landscape') || ''
        const urlMatches = stage1.match(/https?:\/\/(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/gi) || []
        for (const m of urlMatches) {
            if (out.size >= n) break
            try {
                const u = new URL(m)
                const host = u.hostname.replace(/^www\./, '')
                if (host) out.add(host)
            } catch { /* skip */ }
        }
    }

    // Source 3: free-text answers.competitors as last resort
    if (out.size < n) {
        const answers = (rd.answers || {}) as Record<string, unknown>
        const compText = String(answers.competitors || '')
        const urlMatches = compText.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.(?:co\.il|com|io|net|org|ai))/gi) || []
        for (const m of urlMatches) {
            if (out.size >= n) break
            const host = m.replace(/^https?:\/\//, '').replace(/^www\./, '')
            if (host) out.add(host)
        }
    }

    return Array.from(out).slice(0, n)
}

/**
 * Persona-oriented seeds — emotional/problem/JTBD-aligned terms rather
 * than commercial product terms. Produces broad signal for intent mapping.
 */
function derivePersonaSeeds(answers: Record<string, unknown>, businessName: string): string[] {
    const seeds = new Set<string>()

    // User-supplied target audience text often contains the right vocabulary
    const audience = String(answers.targetAudience || '').trim()
    if (audience) {
        const tokens = audience.split(/[,;\n]/).map(t => t.trim()).filter(t => t.length >= 4)
        for (const t of tokens.slice(0, 4)) seeds.add(t)
    }

    // Challenges field — if present, the pain points are the persona seeds
    const challenges = String(answers.challenges || '').trim()
    if (challenges) {
        const tokens = challenges.split(/[,;\n]/).map(t => t.trim()).filter(t => t.length >= 4)
        for (const t of tokens.slice(0, 3)) seeds.add(t)
    }

    if (seeds.size === 0 && businessName) seeds.add(businessName)

    return Array.from(seeds).slice(0, 8)
}