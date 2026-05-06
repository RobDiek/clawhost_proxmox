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
    /** Was Backlinks API accessible? false ⇒ stage will fail with subscription message. */
    backlinksApiAvailable: boolean
    ours: OurDeepLinks
    /** Top N competitors with deep link data. Drawn from competitor_landscape upstream result. */
    competitors: CompetitorDeepLinks[]
    totalCostUsd: number
    cacheHits: number
    cacheMisses: number
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

    // ─── Probe backlinks API access via summary call. If 40204 → hard fail.
    let backlinksApiAvailable = true
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

        console.log(`[prefetch/link_audit] cost=$${totalCostUsd.toFixed(4)} cache=${cacheHits}/${cacheHits + cacheMisses} hit-rate competitors=${competitorResults.length}`)

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
        if (err instanceof DfsError) {
            // 40204 = backlinks subscription not active. Bubble user-friendly Hebrew.
            if (err.message.includes('Access denied') || err.message.includes('40204')) {
                backlinksApiAvailable = false
                throw new DfsError(
                    'task_failed',
                    'אודיט קישורים דורש מנוי DataForSEO Backlinks API פעיל. הפעילו את המנוי ב-https://app.dataforseo.com/backlinks-subscription וחזרו להריץ את השלב.',
                )
            }
            throw err
        }
        throw new DfsError('task_failed', `שגיאה ב-prefetch אודיט קישורים: ${(err as Error).message}`)
    }
}