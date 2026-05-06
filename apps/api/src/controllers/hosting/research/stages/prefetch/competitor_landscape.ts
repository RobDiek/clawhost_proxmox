/**
 * DataForSEO pre-fetch for competitor_landscape stage.
 *
 * Stage controller (manager) calls this BEFORE invoking the prompt builder
 * (chef) — pure separation of "go to market" from "write recipe". The
 * prompt builder takes the returned data and renders it as a factual
 * section in the prompt; the agent never has to estimate.
 *
 * What we fetch:
 *   1. competitorsDomain(our_domain)   — top 50 SERP-overlap competitors (REQUIRED)
 *   2. backlinksSummary(top 5)         — link profile depth per competitor
 *   3. backlinksAnchors(top 3)         — anchor text patterns
 *   4. onPageInstant(top 5 homepages)  — schema, structure, vitals proxy
 *   5. googleMyBusiness(business)      — IL local presence (single call)
 *
 * Hard-fail strategy (playbook §17):
 *   - PRIMARY data (competitorsDomain) — DfsError bubbles up, stage fails.
 *   - SECONDARY enrichment (backlinks/anchors/onPage/gmb) — best-effort.
 *     Per-competitor failures are logged and skipped; stage continues
 *     with partial enrichment because "missing one optional enrichment"
 *     is different from "no data at all".
 */

import {
    competitorsDomain,
    backlinksSummary,
    backlinksAnchors,
    onPageInstant,
    googleMyBusiness,
    LOCATION_IL,
    DfsError,
    type CompetitorsDomainItem,
    type BacklinksSummary,
    type BacklinksAnchorItem,
    type OnPageItem,
    type GoogleMyBusinessItem,
} from '@/services/research/dataforseo'
import { decideLanguage } from '@/services/research/methodology'
import type { ResearchDataV2 } from '@/services/research/types'

export interface CompetitorEnrichment {
    domain: string
    /** SERP overlap signal from competitors_domain */
    sharedKeywords: number
    avgPosition: number
    organicCount?: number
    /** Best-effort enrichment — undefined when DFS call failed */
    backlinks?: BacklinksSummary
    anchorPatterns?: BacklinksAnchorItem[]
    onPage?: OnPageItem
    /** Per-call diagnostics so the prompt can mention "data unavailable" honestly */
    enrichmentMissing: string[]
}

export interface CompetitorLandscapeDfsData {
    /** Our own domain — null if not configured (stage will note this in prompt) */
    ourDomain: string | null
    /** Was competitor data discovered? false ⇒ stage must report no data */
    hasCompetitorData: boolean
    /** Top 50 competitors by SERP overlap. Empty if no website configured. */
    competitors: CompetitorsDomainItem[]
    /** Top 5 enriched with backlinks/anchors/onPage. */
    topEnriched: CompetitorEnrichment[]
    /** Our own GMB profile if found (null if not local business or not registered) */
    ourGmb: GoogleMyBusinessItem | null
    /** Sum DFS USD cost (cache misses only) — for logging */
    totalCostUsd: number
    /** Counts for log line: cached vs fetched fresh */
    cacheHits: number
    cacheMisses: number
}

/**
 * Run the pre-fetch. Throws DfsError on PRIMARY failures (no key, no credits,
 * invalid creds, primary endpoint failure). Caller handles → user-friendly
 * 502 response.
 */
export async function prefetchCompetitorLandscape(
    instanceId: string,
    rd: ResearchDataV2,
): Promise<CompetitorLandscapeDfsData> {
    const answers = (rd.answers || {}) as Record<string, unknown>
    const businessName = String(answers.businessName || '')
    const websiteUrl = String(answers.websiteUrl || '').trim()

    // Language decision feeds DFS language_code. Default Hebrew unless the
    // business is clearly global-B2B-tech per the methodology decision tree.
    const lang = decideLanguage({
        business_type: inferBusinessType(answers),
        delivery_locality: inferLocality(answers),
        research_corpus: 'mixed',
        trust_heavy: !!(answers.trustHeavy),
        tech_persona: !!(answers.techPersona),
    })
    const languageCode: 'he' | 'en' = lang.primary === 'en' ? 'en' : 'he'

    let ourDomain: string | null = null
    if (websiteUrl) {
        try {
            const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)
            ourDomain = u.hostname.replace(/^www\./, '')
        } catch {
            ourDomain = null
        }
    }

    let totalCostUsd = 0
    let cacheHits = 0
    let cacheMisses = 0
    const trackCall = <T>(r: { cost: number; cached: boolean; items: T[] }) => {
        totalCostUsd += r.cost
        if (r.cached) cacheHits++
        else cacheMisses++
        return r
    }

    // ─── PRIMARY: domain-level competitors. Hard-fail if this errors. ──
    let competitors: CompetitorsDomainItem[] = []
    if (ourDomain) {
        try {
            const r = await competitorsDomain(instanceId, ourDomain, {
                location_code: LOCATION_IL,
                language_code: languageCode,
                limit: 50,
                intersections: 5,
            })
            trackCall(r)
            competitors = r.items
        } catch (err) {
            // Bubble DfsError types we know about — caller maps to user-facing 502
            if (err instanceof DfsError) throw err
            // Unknown errors surface as task_failed equivalent
            throw new DfsError(
                'task_failed',
                `שגיאה בקריאה ל-DataForSEO competitorsDomain: ${(err as Error).message}`,
            )
        }
    }

    // ─── SECONDARY enrichment: best-effort per competitor ──
    const topNDomains = competitors.slice(0, 5).map(c => c.domain)
    const topEnriched: CompetitorEnrichment[] = []
    for (const domain of topNDomains) {
        const enrich: CompetitorEnrichment = {
            domain,
            sharedKeywords: competitors.find(c => c.domain === domain)?.intersections ?? 0,
            avgPosition: competitors.find(c => c.domain === domain)?.avg_position ?? 0,
            organicCount: competitors.find(c => c.domain === domain)?.full_domain_metrics?.organic?.count,
            enrichmentMissing: [],
        }
        // Run the 3 calls per competitor in parallel. Each is best-effort.
        const [blsRes, ancRes, opRes] = await Promise.allSettled([
            backlinksSummary(instanceId, domain),
            backlinksAnchors(instanceId, domain, { limit: 50 }),
            onPageInstant(instanceId, `https://${domain}`),
        ])
        if (blsRes.status === 'fulfilled') {
            trackCall(blsRes.value)
            enrich.backlinks = blsRes.value.items[0]
        } else {
            enrich.enrichmentMissing.push('backlinks_summary')
            console.warn(`[prefetch/competitor_landscape] backlinks ${domain} failed:`, (blsRes.reason as Error).message)
        }
        if (ancRes.status === 'fulfilled') {
            trackCall(ancRes.value)
            enrich.anchorPatterns = ancRes.value.items
        } else {
            enrich.enrichmentMissing.push('backlinks_anchors')
            console.warn(`[prefetch/competitor_landscape] anchors ${domain} failed:`, (ancRes.reason as Error).message)
        }
        if (opRes.status === 'fulfilled') {
            trackCall(opRes.value)
            enrich.onPage = opRes.value.items[0]
        } else {
            enrich.enrichmentMissing.push('on_page_audit')
            console.warn(`[prefetch/competitor_landscape] onPage ${domain} failed:`, (opRes.reason as Error).message)
        }
        topEnriched.push(enrich)
    }

    // ─── GMB lookup (single call for our business) ──
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
            console.warn(`[prefetch/competitor_landscape] GMB lookup failed:`, (err as Error).message)
            // GMB failure is non-fatal — many businesses aren't in GBP
        }
    }

    console.log(`[prefetch/competitor_landscape] cost=$${totalCostUsd.toFixed(4)} cache=${cacheHits}/${cacheHits + cacheMisses} hit-rate competitors=${competitors.length} enriched=${topEnriched.length}`)

    return {
        ourDomain,
        hasCompetitorData: competitors.length > 0,
        competitors,
        topEnriched,
        ourGmb,
        totalCostUsd,
        cacheHits,
        cacheMisses,
    }
}

// ── Heuristics for language decision input ──
// These are rough — answers schema is loose. We default toward IL local /
// trust-heavy to match the typical Flowmatic customer profile.

function inferBusinessType(answers: Record<string, unknown>): 'b2b' | 'b2c' | 'mixed' {
    const txt = (
        String(answers.businessDescription || '') + ' ' +
        String(answers.targetAudience || '') + ' ' +
        String(answers.platforms || '')
    ).toLowerCase()
    const b2b = /b2b|saas|enterprise|api|developer|procurement|reseller/i.test(txt)
    const b2c = /b2c|consumer|retail|ecommerce|shop|לקוחות|צרכנים|חנות/i.test(txt)
    if (b2b && !b2c) return 'b2b'
    if (b2c && !b2b) return 'b2c'
    return 'mixed'
}

function inferLocality(answers: Record<string, unknown>): 'il_local' | 'il_national' | 'global_from_il' {
    const txt = (
        String(answers.businessDescription || '') + ' ' +
        String(answers.targetAudience || '')
    ).toLowerCase()
    if (/global|international|worldwide|abroad|export/i.test(txt)) return 'global_from_il'
    if (/local|רחוב|עיר|אזור|סניף|מקומי|near me/i.test(txt)) return 'il_local'
    return 'il_national'
}