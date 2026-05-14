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
    // 1. Resolve seed keywords from user answers
    const answers = (rd.answers as Record<string, unknown>) || {}
    const seedKeywords: string[] = []

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

    return fetchPaidKeywordLandscape({
        instanceId,
        seedKeywords: Array.from(new Set(seedKeywords)).slice(0, 10),
        competitorDomains: Array.from(new Set(competitorDomains)).slice(0, 5),
        brandName: businessName,
        maxKeywords: 80,
    })
}