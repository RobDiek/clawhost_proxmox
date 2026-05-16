/**
 * Prefetch for paid_keyword_research stage.
 *
 * Reads:
 *   - rd.results.paid_competitor_landscape.records → competitor domains
 *   - rd.answers.targetKeywords → user seed keywords
 *   - rd.answers.products → product names (additional seeds)
 *   - rd.answers.businessName → brand-keyword detection
 *
 * Calls services/paidResearch/keywordPaidLandscape.fetchPaidKeywordLandscape.
 *
 * Output: PaidKeywordLandscape — fed to the prompt builder for Opus synthesis.
 */

import type { ResearchDataV2 } from '@/services/research/types'
import { fetchPaidKeywordLandscape, type PaidKeywordLandscape } from '@/services/paidResearch/keywordPaidLandscape'

interface CompetitorRecord {
    domain?: string
    name?: string
}

interface ProductSku {
    name?: string
}

export async function prefetchPaidKeywordResearch(
    instanceId: string,
    rd: ResearchDataV2,
): Promise<PaidKeywordLandscape> {
    const answers = (rd.answers as Record<string, unknown>) || {}
    const seedKeywords: string[] = []
    const accountLevelNegatives: string[] = []

    // ─── PRIORITY 1 (Phase 4.2.1-H): SQR top-converters from baseline ─────
    // If client_account_baseline ran and pulled SQR top-converting terms, use
    // them as Tier-1 seeds. These are PROVEN to convert in this exact account,
    // beating any DFS guess. Likewise the SQR waste patterns become preemptive
    // negatives. Without this injection the keyword research expansion goes off
    // on tangents (e.g. apartment rentals when seed is generic 'להשכרה').
    interface SqrConvertingTerm { searchTerm?: string; conversions?: number; cpa?: number; clicks?: number }
    interface SqrWastePattern { pattern?: string; clicks?: number; conversions?: number; spendIls?: number }
    interface BaselineResult {
        dfsData?: {
            googleAds?: {
                available?: boolean
                sqr?: {
                    available?: boolean
                    topConvertingTerms?: SqrConvertingTerm[]
                    wasteByPattern?: SqrWastePattern[]
                }
            }
        }
    }
    const baseline = rd.results?.client_account_baseline as BaselineResult | undefined
    const sqr = baseline?.dfsData?.googleAds?.sqr
    if (sqr?.available && Array.isArray(sqr.topConvertingTerms)) {
        // Take top 8 by conversions — these are Tier-1 seeds. They go FIRST in
        // the seed list so DataForSEO expansion ranks them most influential.
        const tier1 = sqr.topConvertingTerms
            .filter(t => t.searchTerm && (t.conversions ?? 0) > 0)
            .slice(0, 8)
        for (const t of tier1) {
            if (t.searchTerm) seedKeywords.push(t.searchTerm.trim())
        }
        console.log(`[paid_keyword_research/prefetch] SQR Tier-1: ${tier1.length} seeds from baseline (${tier1.map(t => t.searchTerm).join(' | ')})`)
    }
    if (sqr?.available && Array.isArray(sqr.wasteByPattern)) {
        // Top 12 waste patterns by spend → preemptive negative keywords
        for (const w of sqr.wasteByPattern.slice(0, 12)) {
            if (w.pattern && (w.conversions ?? 0) === 0 && (w.clicks ?? 0) >= 5) {
                accountLevelNegatives.push(w.pattern.trim())
            }
        }
    }

    // ─── PRIORITY 2: user answers (target keywords + product names) ───────
    const targetRaw = answers.targetKeywords
    if (typeof targetRaw === 'string') {
        for (const s of targetRaw.split(/[,\n;]/)) {
            const k = s.trim()
            if (k.length >= 3) seedKeywords.push(k)
        }
    } else if (Array.isArray(targetRaw)) {
        for (const s of targetRaw) {
            if (typeof s === 'string' && s.trim().length >= 3) seedKeywords.push(s.trim())
        }
    }

    // Product names as seeds (often the strongest commercial-intent terms)
    const products = answers.products as ProductSku[] | undefined
    if (Array.isArray(products)) {
        for (const p of products) {
            if (typeof p?.name === 'string' && p.name.trim().length >= 3) {
                seedKeywords.push(p.name.trim())
            }
        }
    }

    // Phase 4.2(fix) — pull seeds from prior research stages. Without this
    // step a service business (no products) with English business name (e.g.
    // "Storage Station") falls back to the English brand name as the only
    // seed → DataForSEO expansion picks up tourist/luggage queries
    // ("luggage storage", "self storage") instead of the IL-native terms
    // the actual customers use ("מחסן להשכרה", "אחסון תכולת דירה").
    //
    // The data is already there from competitor_landscape: each record
    // carries `topic_coverage.dominated_topics[].sample_keywords` with the
    // real Hebrew keywords competitors target. Use them as seeds.
    interface TopicCoverage {
        dominated_topics?: Array<{ topic?: string; sample_keywords?: string[] }>
    }
    interface CompLandscapeRec {
        topic_coverage?: TopicCoverage
        name?: string
        domain?: string
    }
    const organicLandscape = rd.results?.competitor_landscape
    if (organicLandscape?.records && seedKeywords.length < 8) {
        const records = organicLandscape.records as CompLandscapeRec[]
        // Collect competitor brand tokens to filter from seed keywords.
        // Competitor "name" + first segment of "domain" tend to appear as
        // standalone brand tokens or co-occur with the brand in sample keywords.
        const brandTokens = new Set<string>()
        for (const rec of records) {
            if (typeof rec?.name === 'string') {
                rec.name.toLowerCase().split(/[\s\-_().]+/).forEach(t => {
                    if (t.length >= 3 && t.length < 12) brandTokens.add(t)
                })
            }
            if (typeof rec?.domain === 'string') {
                const root = rec.domain.toLowerCase().replace(/\.(co\.il|com|net|org|io).*/, '').replace(/^www\./, '')
                root.split(/[.-]/).forEach(t => {
                    if (t.length >= 3 && t.length < 12) brandTokens.add(t)
                })
            }
        }
        for (const rec of records) {
            const topics = rec?.topic_coverage?.dominated_topics
            if (!Array.isArray(topics)) continue
            for (const t of topics) {
                // Skip topics explicitly marked as (navigational) — those are
                // competitor brand-search topics, not category terms.
                const topicTitle = (t?.topic || '').toLowerCase()
                if (/navigational|brand/i.test(topicTitle)) continue
                if (!Array.isArray(t?.sample_keywords)) continue
                for (const kw of t.sample_keywords) {
                    if (typeof kw !== 'string' || kw.trim().length < 3) continue
                    const cleaned = kw.trim().toLowerCase()
                    // Skip single-token short word (likely competitor brand)
                    const isBrandLikeSolo = cleaned.split(/\s+/).length === 1 && cleaned.length < 8
                    if (isBrandLikeSolo) continue
                    // Skip if any token of the keyword matches a competitor brand
                    const tokens = cleaned.split(/\s+/)
                    const containsBrand = tokens.some(tk => brandTokens.has(tk))
                    if (containsBrand) continue
                    // Reject pure-Latin keywords (DFS expansion of "storage" /
                    // English brand goes off-vertical for IL audience).
                    if (/^[a-z0-9\s-]+$/.test(cleaned)) continue
                    seedKeywords.push(kw.trim())
                    if (seedKeywords.length >= 12) break
                }
                if (seedKeywords.length >= 12) break
            }
            if (seedKeywords.length >= 12) break
        }
    }

    // Also: pull seeds from prior seo_keyword_research stage if it ran
    // (those are validated paid-relevant keywords). Limit to top 5.
    const seoKwResult = rd.results?.seo_keyword_research as { records?: Array<{ keyword?: string }> } | undefined
    if (seoKwResult?.records && seedKeywords.length < 12) {
        for (const r of seoKwResult.records.slice(0, 5)) {
            if (typeof r?.keyword === 'string' && r.keyword.trim().length >= 3) {
                seedKeywords.push(r.keyword.trim())
            }
        }
    }

    // Fallback: businessName as seed
    const businessName = typeof answers.businessName === 'string' ? answers.businessName.trim() : ''
    if (seedKeywords.length === 0 && businessName.length >= 3) {
        seedKeywords.push(businessName)
    }

    // 2. Competitor domains from paid_competitor_landscape (or organic competitor_landscape as fallback)
    const competitorDomains: string[] = []
    const paidLandscape = rd.results?.paid_competitor_landscape
    if (paidLandscape?.records) {
        const records = paidLandscape.records as CompetitorRecord[]
        for (const r of records) {
            if (typeof r?.domain === 'string') competitorDomains.push(r.domain)
        }
    }
    if (competitorDomains.length === 0) {
        const organicLandscape = rd.results?.competitor_landscape
        if (organicLandscape?.records) {
            const records = organicLandscape.records as CompetitorRecord[]
            for (const r of records) {
                if (typeof r?.domain === 'string') competitorDomains.push(r.domain)
            }
        }
    }

    // Phase 4.2.1-H — propagate SQR top-converters (Tier-1 seeds with real
    // CPA/conversions data) and account-level negatives (waste patterns)
    // to the landscape builder + downstream prompt.
    const sqrTopConvertersForFetch = (sqr?.topConvertingTerms || [])
        .filter(t => t.searchTerm && (t.conversions ?? 0) > 0)
        .slice(0, 10)
        .map(t => ({
            searchTerm: t.searchTerm as string,
            conversions: t.conversions ?? 0,
            cpa: t.cpa ?? 0,
            clicks: t.clicks ?? 0,
        }))

    return fetchPaidKeywordLandscape({
        instanceId,
        seedKeywords: Array.from(new Set(seedKeywords)).slice(0, 10),
        competitorDomains: Array.from(new Set(competitorDomains)).slice(0, 5),
        brandName: businessName,
        maxKeywords: 80,
        accountLevelNegatives,
        sqrTopConverters: sqrTopConvertersForFetch.length > 0 ? sqrTopConvertersForFetch : undefined,
    })
}