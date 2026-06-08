/**
 * DataForSEO pre-fetch for link_audit stage.
 *
 * link_audit goes DEEPER than the Phase 3.10b backlinks subset that
 * competitor_landscape ships. Where that one analyzes link profiles as a
 * supporting signal for SERP positioning, this stage's *only* job is the
 * link profile: full backlinks suite for our domain + top 10 competitors,
 * lost-links recovery roadmap, anchor distribution analysis, link velocity,
 * and prioritized outreach candidates.
 *
 * What we fetch:
 *   1. Our domain — summary + anchors(top 100) + referring_domains(top 200,
 *      include_lost=true) + competitors(top 100)
 *   2. Top 10 competitors (from upstream competitor_landscape result):
 *      summary + anchors(top 50) + referring_domains(top 50)
 *
 * Hard-fail strategy:
 *   - DFS Backlinks API access denied (40204) → throw DfsError. The whole
 *     stage hard-fails because there's literally nothing to analyze without
 *     this data — that's the whole point of the stage. Caller maps to
 *     a clear "activate the Backlinks subscription" error.
 *   - Per-competitor failures are best-effort (logged, marked missing).
 */

import {
    backlinksSummary,
    backlinksAnchors,
    backlinksReferringDomains,
    backlinksCompetitors,
    DfsError,
    type BacklinksSummary,
    type BacklinksAnchorItem,
    type ReferringDomainItem,
    type BacklinksCompetitorItem,
} from '@/services/research/dataforseo'
import type { ResearchDataV2 } from '@/services/research/types'

export interface OurDeepLinks {
    summary?: BacklinksSummary
    anchors?: BacklinksAnchorItem[]
    referringDomains?: ReferringDomainItem[]
    /** Subset of referringDomains where backlinks_count_dropped > 0 — recovery candidates. */
    lostLinks?: ReferringDomainItem[]
    /** Domains linking to competitors but NOT us — outreach prospects. */
    linkGap?: BacklinksCompetitorItem[]
    /**
     * REAL link-gap prospect DOMAINS — derived by subtracting our referring
     * domains from the union of competitors' referring domains. Each carries
     * the actual domain name (so the LLM can name it + bulk_ranks can look up
     * DR), how many competitors link to it (intersect), and its DFS rank.
     * This is what makes link_gap_outreach records real instead of anonymized.
     */
    linkGapProspects?: Array<{ domain: string; rank: number; competitorsLinking: number }>
    enrichmentMissing: string[]
}

export interface CompetitorDeepLinks {
    domain: string
    summary?: BacklinksSummary
    anchors?: BacklinksAnchorItem[]
    referringDomains?: ReferringDomainItem[]
    enrichmentMissing: string[]
}

export interface LinkAuditDfsData {
    ourDomain: string | null
    /** Was Backlinks API accessible? false ⇒ stage runs in degraded mode with empty data. */
    backlinksApiAvailable: boolean
    ours: OurDeepLinks
    /** Top N competitors with deep link data. Drawn from competitor_landscape upstream result. */
    competitors: CompetitorDeepLinks[]
    totalCostUsd: number
    cacheHits: number
    cacheMisses: number
    /** Phase E2 soft-fail — Hebrew message to surface to user when backlinksApiAvailable=false. */
    subscriptionFailureMessage?: string | null
}

export async function prefetchLinkAudit(
    instanceId: string,
    rd: ResearchDataV2,
): Promise<LinkAuditDfsData> {
    const answers = (rd.answers || {}) as Record<string, unknown>
    const websiteUrl = String(answers.websiteUrl || '').trim()

    let ourDomain: string | null = null
    if (websiteUrl) {
        try {
            const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)
            ourDomain = u.hostname.replace(/^www\./, '')
        } catch {
            ourDomain = null
        }
    }

    if (!ourDomain) {
        throw new DfsError('task_failed', 'אין domain מוגדר ב-answers.websiteUrl — לא ניתן לבצע אודיט קישורים.')
    }

    // Pull top 10 competitor domains from upstream competitor_landscape result.
    // If upstream missing → stage fails fast with a clear message.
    type CompetitorRecord = { url?: string; domain?: string }
    const upstreamRecords = ((rd.results?.competitor_landscape?.records as CompetitorRecord[] | undefined) || [])
        .slice(0, 10)
    const competitorDomains: string[] = []
    for (const c of upstreamRecords) {
        const raw = (c.url || c.domain || '').trim()
        if (!raw) continue
        try {
            const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
            const d = u.hostname.replace(/^www\./, '')
            if (d && d !== ourDomain) competitorDomains.push(d)
        } catch { /* skip */ }
    }
    if (competitorDomains.length === 0) {
        throw new DfsError('task_failed', 'אודיט קישורים דורש קודם הרצה של "נוף תחרותי" — לא נמצאו דומיינים מתחרים.')
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

    // ─── Probe backlinks API access via summary call.
    // Phase E2 — soft-fail policy: if subscription is missing/inactive,
    // return empty data with backlinksApiAvailable=false + a clear
    // user-facing message instead of throwing 500. The prompt downstream
    // renders "אודיט קישורים — נתונים לא זמינים" and the AI continues
    // analysis with whatever upstream data exists (competitor_landscape,
    // GMB, etc).
    let backlinksApiAvailable = true
    let subscriptionFailureMessage: string | null = null
    try {
        const r = await backlinksSummary(instanceId, ourDomain)
        trackCall(r)
        // success — keep going below; don't double-fetch.
        const ours: OurDeepLinks = { summary: r.items[0], enrichmentMissing: [] }

        // ─── Our domain — deep suite (3 more calls in parallel) ──
        const [oursAnch, oursRef, linkGap] = await Promise.allSettled([
            backlinksAnchors(instanceId, ourDomain, { limit: 100 }),
            backlinksReferringDomains(instanceId, ourDomain, { limit: 200, include_lost: true }),
            backlinksCompetitors(instanceId, ourDomain, { limit: 100 }),
        ])
        if (oursAnch.status === 'fulfilled') {
            trackCall(oursAnch.value)
            ours.anchors = oursAnch.value.items
        } else {
            ours.enrichmentMissing.push('our_anchors')
        }
        if (oursRef.status === 'fulfilled') {
            trackCall(oursRef.value)
            ours.referringDomains = oursRef.value.items
            ours.lostLinks = oursRef.value.items.filter(d => d.is_lost === true || !!d.lost_date)
        } else {
            ours.enrichmentMissing.push('our_referring_domains')
        }
        if (linkGap.status === 'fulfilled') {
            trackCall(linkGap.value)
            ours.linkGap = linkGap.value.items
        } else {
            ours.enrichmentMissing.push('link_gap_analysis')
        }

        // ─── Per-competitor deep link suite (parallel across competitors) ──
        const competitorResults = await Promise.all(competitorDomains.map(async (domain): Promise<CompetitorDeepLinks> => {
            const c: CompetitorDeepLinks = { domain, enrichmentMissing: [] }
            const [sum, anch, ref] = await Promise.allSettled([
                backlinksSummary(instanceId, domain),
                backlinksAnchors(instanceId, domain, { limit: 50 }),
                backlinksReferringDomains(instanceId, domain, { limit: 50 }),
            ])
            if (sum.status === 'fulfilled') { trackCall(sum.value); c.summary = sum.value.items[0] }
            else c.enrichmentMissing.push('summary')
            if (anch.status === 'fulfilled') { trackCall(anch.value); c.anchors = anch.value.items }
            else c.enrichmentMissing.push('anchors')
            if (ref.status === 'fulfilled') { trackCall(ref.value); c.referringDomains = ref.value.items }
            else c.enrichmentMissing.push('referring_domains')
            return c
        }))

        // ─── Derive REAL link-gap prospect domains ──────────────────────
        // Union of competitors' referring domains MINUS our referring domains.
        // These are the actual sites to outreach (named domains the LLM can
        // emit + bulk_ranks can rank), ranked by how many competitors link to
        // them (the strongest gap signal) then by DFS rank.
        const norm = (d?: string) => (d || '').trim().toLowerCase().replace(/^www\./, '')
        const ourRefSet = new Set((ours.referringDomains || []).map(d => norm(d.domain)))
        ourRefSet.add(norm(ourDomain))
        const gapAgg = new Map<string, { rank: number; competitorsLinking: number }>()
        for (const c of competitorResults) {
            const seenForThisComp = new Set<string>()
            for (const rd2 of c.referringDomains || []) {
                const d = norm(rd2.domain)
                if (!d || ourRefSet.has(d) || seenForThisComp.has(d)) continue
                seenForThisComp.add(d)
                const prev = gapAgg.get(d)
                const rank = typeof rd2.rank === 'number' ? rd2.rank : 0
                if (prev) { prev.competitorsLinking++; if (rank > prev.rank) prev.rank = rank }
                else gapAgg.set(d, { rank, competitorsLinking: 1 })
            }
        }
        ours.linkGapProspects = Array.from(gapAgg.entries())
            .map(([domain, v]) => ({ domain, rank: v.rank, competitorsLinking: v.competitorsLinking }))
            .sort((a, b) => (b.competitorsLinking - a.competitorsLinking) || (b.rank - a.rank))
            .slice(0, 30)

        console.log(`[prefetch/link_audit] cost=$${totalCostUsd.toFixed(4)} cache=${cacheHits}/${cacheHits + cacheMisses} hit-rate competitors=${competitorResults.length} linkGapProspects=${ours.linkGapProspects.length}`)

        return {
            ourDomain,
            backlinksApiAvailable,
            ours,
            competitors: competitorResults,
            totalCostUsd,
            cacheHits,
            cacheMisses,
        }
    } catch (err) {
        // Soft-fail across all DfsError causes (subscription missing, rate
        // limit, transient outage, etc). Stage continues with empty link
        // data so the prompt can render a clear "data unavailable" panel
        // and rest of the pipeline still flows.
        const isAccessDenied = err instanceof DfsError &&
            (err.message.includes('Access denied') || err.message.includes('40204'))
        backlinksApiAvailable = false
        subscriptionFailureMessage = isAccessDenied
            ? 'אודיט קישורים דורש מנוי DataForSEO Backlinks API פעיל. הפעילו את המנוי ב-https://app.dataforseo.com/backlinks-subscription והשלב יתעדכן בריצה הבאה.'
            : `נתוני אודיט קישורים לא זמינים מ-DataForSEO: ${(err as Error).message}`
        console.warn(`[prefetch/link_audit] soft-fail: ${subscriptionFailureMessage}`)
        return {
            ourDomain,
            backlinksApiAvailable,
            ours: { enrichmentMissing: ['backlinks_api_unavailable'] },
            competitors: competitorDomains.map(domain => ({
                domain,
                enrichmentMissing: ['backlinks_api_unavailable'],
            })),
            totalCostUsd,
            cacheHits,
            cacheMisses,
            subscriptionFailureMessage,
        }
    }
}