/**
 * Post-LLM augmenter for link_audit stage records.
 *
 * Why post-LLM:
 *   The LLM is good at the narrative (outreach angles, recovery rationale,
 *   tier-1 pitch ideas) and at categorizing prospects (lost_link_recovery /
 *   link_gap_outreach / anchor_remediation). It is unreliable at — and is
 *   FORBIDDEN from inventing (אסור להמציא מספרים) — the deterministic
 *   senior-pro specifics a 7-yr-SEO link plan must carry per link:
 *     - prospect Domain Rating (recovered from DFS, not guessed)
 *     - ₪ cost (from ilCostConstants DR tier × FX, not invented)
 *     - which OUR money/pillar page the link should point to (target_page)
 *     - the exact anchor + its type, distributed across the whole link set
 *       to hit a healthy branded/partial/exact ratio (anti-over-optimization)
 *     - build sequence packed into the chosenScenario monthly link budget
 *
 * This module computes all of that deterministically from:
 *   - records[]                (LLM-emitted prospects)
 *   - dfsData                  (real DFS Backlinks ranks, by domain join)
 *   - rd.results.seo_keyword_research.records  (priority money pages + anchors)
 *   - rd.chosenScenario        (Smart/Aggressive monthly link budget — NEVER
 *                               ask the user; read the calibrated scenario)
 *
 * No re-calling the LLM, no new external IO. Defensive: missing/malformed
 * fields fall back to safe defaults rather than throw — augmentation is
 * best-effort and non-fatal (caller wraps in try/catch).
 *
 * Plan-context: roadmap/external-links-upgrade.md
 */

import {
    LINK_COSTS_USD,
    USD_TO_ILS_RATE,
    BACKLINK_BUDGET_ILS_PER_MONTH,
    type LinkTier,
} from '@/services/research/ilCostConstants'

// ── Input shapes (loose — defensive accessors) ──────────────────────────────

interface RawLinkRecord {
    type?: string
    domain?: string
    current_rank?: number
    priority?: string
    outreach_angle?: string
    estimated_effort_hours?: number
    confidence?: string
    [k: string]: unknown
}

interface DfsRefDomain { domain?: string; rank?: number; intersections?: number; target?: string }
interface LinkAuditDfsShape {
    ours?: {
        referringDomains?: DfsRefDomain[]
        lostLinks?: DfsRefDomain[]
        linkGap?: DfsRefDomain[]
    }
    competitors?: Array<{ referringDomains?: DfsRefDomain[] }>
    /** Per-prospect ranks fetched via backlinks/bulk_ranks for the record
     *  domains the LLM proposed (incl. playbook tier-1 domains not in our own
     *  link data). Most accurate prospect-DR source when present. */
    bulkRanks?: DfsRefDomain[]
}

interface SkrRecord {
    keyword?: string
    cluster?: string
    page_type?: string
    // intent is an OBJECT { primary, primary_normalized, jtbd, ... } in current
    // seo_keyword_research output — not a bare string. Accept both shapes.
    intent?: string | { primary?: string; primary_normalized?: string }
    opportunity?: number | { total?: number }
    [k: string]: unknown
}

function skrIntent(r: SkrRecord): string {
    const i = r.intent
    if (i && typeof i === 'object') return String(i.primary_normalized || i.primary || '')
    return String(i || '')
}

// ── Output shape ────────────────────────────────────────────────────────────

export type AnchorType = 'branded' | 'partial' | 'exact' | 'generic'

export interface AugmentedLinkRecord extends RawLinkRecord {
    prospect_dr: number | null            // Ahrefs-comparable DR (DFS rank ÷ 10), null if unknown
    dr_source: 'dfs_rank' | 'domain_class' | 'unknown'
    tier: LinkTier
    relevance: 'high' | 'medium' | 'low'
    estimated_cost_ils: number
    target_page: string                   // logical: "{cluster} ({page_type})"
    anchor_keyword: string                // the actual anchor TEXT to use
    anchor_type: AnchorType
    sequence_order: number                // 1-based build order within the plan
    month: number                         // 1-based month the link is scheduled
    month_week: number                    // 1-4 week within that month
}

export interface LinkStrategySummary {
    scenario: 'smart' | 'aggressive'
    monthly_budget_ils: number
    planned_links_total: number
    links_per_month: number
    total_cost_ils: number
    months_to_complete: number
    anchor_distribution_planned: Record<AnchorType, number>   // counts
    anchor_distribution_pct: Record<AnchorType, number>       // % of set
    tier_distribution: Record<LinkTier, number>               // counts
    over_optimization_guard_applied: boolean
    warnings: string[]
}

export interface AugmentLinkAuditResult {
    augmented_records: AugmentedLinkRecord[]
    link_strategy_summary: LinkStrategySummary
}

// ── Canonical IL tier-1 editorial domains (floor guard — see DR mapping note) ─
const IL_TIER1_DOMAINS = new Set([
    'globes.co.il', 'calcalist.co.il', 'themarker.com', 'mako.co.il',
    'ynet.co.il', 'geektime.co.il', 'walla.co.il', 'israelhayom.co.il',
    'haaretz.co.il', 'n12.co.il', 'maariv.co.il',
])
// Low-DR general directories — floor DOWN to DR_low when rank is missing.
const IL_DIRECTORY_DOMAINS = new Set([
    'b144.co.il', 'dapei-zahav.co.il', 'd.co.il', 'zap.co.il', 'easy.co.il',
])

// ── DR → cost tier (ilCostConstants is Ahrefs-DR scale 0-100) ───────────────
function drToTier(dr: number): LinkTier {
    if (dr >= 70) return 'DR_premium'
    if (dr >= 50) return 'DR_high'
    if (dr >= 30) return 'DR_mid'
    return 'DR_low'
}

function normDomain(d: string | undefined | null): string {
    return String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
}

// ── Main ────────────────────────────────────────────────────────────────────

export function augmentLinkAuditRecords(
    records: RawLinkRecord[],
    dfsData: LinkAuditDfsShape | undefined,
    rd: Record<string, unknown> | undefined,
    businessName: string,
    anchorProfile?: { exact_match_pct?: number; risk_flags?: string[] },
): AugmentLinkAuditResult {
    const warnings: string[] = []

    // 1) Build a domain → DFS rank map from every available source.
    const drMap = buildDrMap(dfsData)

    // 2) Scenario + monthly budget (read chosenScenario — never ask the user).
    const scenario = resolveScenario(rd)
    const monthlyBudget = BACKLINK_BUDGET_ILS_PER_MONTH[scenario]

    // 3) Priority target pages (money/pillar pages) from seo_keyword_research.
    const targetPages = extractPriorityTargetPages(rd)
    if (targetPages.length === 0) {
        warnings.push('no_priority_target_pages — seo_keyword_research had no commercial/pillar records; using homepage fallback')
        targetPages.push({ label: 'דף הבית (homepage)', anchorKeyword: businessName, cluster: 'brand', opportunity: 0 })
    }

    // 4) Per-record: DR, tier, cost, relevance.
    const enriched = records.map((r) => {
        const domain = normDomain(r.domain)
        const { dr, source } = resolveDr(domain, drMap)
        const tier = resolveTier(domain, dr)
        const costUsd = LINK_COSTS_USD[tier].avg_per_link_usd
        const estimated_cost_ils = Math.round(costUsd * USD_TO_ILS_RATE)
        const relevance = resolveRelevance(domain, r, drMap)
        return {
            raw: r,
            domain,
            dr,
            dr_source: source,
            tier,
            relevance,
            estimated_cost_ils,
            target_page: '',
            base_keyword: '',
        }
    })

    // 4b) Assign target pages by PROSPECT VALUE → page OPPORTUNITY: the
    // highest-authority/most-relevant links point at the top money pages
    // (targetPages is already sorted by opportunity desc). Round-robin within
    // that value order so equity still spreads across all commercial clusters.
    const linkValue = (e: typeof enriched[number]) =>
        (e.dr ?? 0) + (e.relevance === 'high' ? 50 : e.relevance === 'medium' ? 20 : 0)
    const valueOrder = [...enriched.keys()].sort((a, b) => linkValue(enriched[b]) - linkValue(enriched[a]))
    valueOrder.forEach((idx, rank) => {
        const tp = targetPages[rank % targetPages.length]
        enriched[idx].target_page = tp.label
        enriched[idx].base_keyword = tp.anchorKeyword
    })

    // 5) Anchor distribution planner across the WHOLE set (anti-over-optimization).
    const overOpt = (anchorProfile?.exact_match_pct ?? 0) > 30 ||
        (anchorProfile?.risk_flags || []).some(f => /over_optimization/i.test(String(f)))
    const anchorTypes = planAnchorDistribution(enriched.length, overOpt, enriched)

    // 6) Build sequence + pack into the monthly budget.
    //    Order: lost_link_recovery (cheap, high ROI) → high-DR link_gap →
    //    tier-1 editorial → everything else.
    const order = [...enriched.keys()].sort((a, b) => sequenceRank(enriched[a]) - sequenceRank(enriched[b]))

    const augmented_records: AugmentedLinkRecord[] = new Array(enriched.length)
    let runningCost = 0
    let month = 1
    let inMonthCount = 0
    const linksPerMonthCap = Math.max(1, Math.round(monthlyBudget / averageLinkCost(enriched)))

    order.forEach((idx, seq) => {
        const e = enriched[idx]
        // Roll to next month when this link would blow the running monthly budget
        // OR we've hit the per-month link cap.
        if (runningCost + e.estimated_cost_ils > monthlyBudget * month || inMonthCount >= linksPerMonthCap) {
            month++
            inMonthCount = 0
        }
        inMonthCount++
        runningCost += e.estimated_cost_ils
        const anchor_type = anchorTypes[idx]
        augmented_records[idx] = {
            ...e.raw,
            prospect_dr: e.dr,
            dr_source: e.dr_source,
            tier: e.tier,
            relevance: e.relevance,
            estimated_cost_ils: e.estimated_cost_ils,
            target_page: e.target_page,
            anchor_keyword: composeAnchorText(anchor_type, e.base_keyword, businessName, e.domain),
            anchor_type,
            sequence_order: seq + 1,
            month,
            month_week: ((inMonthCount - 1) % 4) + 1,
        }
    })

    // 7) Summary + quality gate.
    const total_cost_ils = augmented_records.reduce((s, r) => s + r.estimated_cost_ils, 0)
    const anchorCounts = tally(augmented_records.map(r => r.anchor_type)) as Record<AnchorType, number>
    for (const t of ['branded', 'partial', 'exact', 'generic'] as AnchorType[]) anchorCounts[t] = anchorCounts[t] || 0
    const tierCounts = tally(augmented_records.map(r => r.tier)) as Record<LinkTier, number>
    const monthsToComplete = augmented_records.reduce((m, r) => Math.max(m, r.month), 1)
    const n = Math.max(1, augmented_records.length)

    // Quality gate — pair the schema fields with content validators
    // (feedback_schema_ne_strategy): healthy anchor mix + target coverage.
    const exactPct = Math.round((anchorCounts.exact / n) * 100)
    const brandedPct = Math.round((anchorCounts.branded / n) * 100)
    if (exactPct > 25) warnings.push(`anchor_distribution: planned exact-match ${exactPct}% > 25% cap — over-optimization risk`)
    if (brandedPct < 40) warnings.push(`anchor_distribution: planned branded ${brandedPct}% < 40% — anchor profile too aggressive`)
    if (augmented_records.some(r => !r.target_page)) warnings.push('some records missing target_page')

    const link_strategy_summary: LinkStrategySummary = {
        scenario,
        monthly_budget_ils: monthlyBudget,
        planned_links_total: augmented_records.length,
        links_per_month: linksPerMonthCap,
        total_cost_ils,
        months_to_complete: monthsToComplete,
        anchor_distribution_planned: anchorCounts,
        anchor_distribution_pct: {
            branded: brandedPct,
            partial: Math.round((anchorCounts.partial / n) * 100),
            exact: exactPct,
            generic: Math.round((anchorCounts.generic / n) * 100),
        },
        tier_distribution: tierCounts,
        over_optimization_guard_applied: overOpt,
        warnings,
    }

    return { augmented_records, link_strategy_summary }
}

// ── DR recovery ─────────────────────────────────────────────────────────────

function buildDrMap(dfs: LinkAuditDfsShape | undefined): Map<string, number> {
    const map = new Map<string, number>()
    const add = (items?: DfsRefDomain[]) => {
        for (const it of items || []) {
            const d = normDomain(it.domain || it.target)
            const rank = typeof it.rank === 'number' ? it.rank : undefined
            if (d && rank !== undefined && rank > 0) {
                // keep the highest rank seen for a domain
                if (!map.has(d) || (map.get(d) as number) < rank) map.set(d, rank)
            }
        }
    }
    // bulk_ranks first — most direct per-prospect DR (its `target` is the
    // prospect domain). add() reads it via the shared target/domain accessor.
    add(dfs?.bulkRanks)
    add(dfs?.ours?.referringDomains)
    add(dfs?.ours?.lostLinks)
    add(dfs?.ours?.linkGap)
    for (const c of dfs?.competitors || []) add(c.referringDomains)
    return map
}

function resolveDr(domain: string, drMap: Map<string, number>): { dr: number | null; source: AugmentedLinkRecord['dr_source'] } {
    const raw = drMap.get(domain)
    if (raw !== undefined && raw > 0) {
        // DFS backlinks rank is a 0-1000 metric; ÷10 ≈ Ahrefs-comparable DR 0-100.
        return { dr: Math.min(100, Math.round(raw / 10)), source: 'dfs_rank' }
    }
    return { dr: null, source: 'unknown' }
}

const TIER_ORDER: LinkTier[] = ['DR_low', 'DR_mid', 'DR_high', 'DR_premium']
function resolveTier(domain: string, dr: number | null): LinkTier {
    if (dr !== null) {
        // Real DR available → trust it. Only floor UP for tier-1 editorial
        // domains: their EDITORIAL placement costs more than a raw DFS rank
        // implies (a sponsored piece on TheMarker ≠ a DR-49 guest post).
        let tier = drToTier(dr)
        if (IL_TIER1_DOMAINS.has(domain) && TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf('DR_high')) tier = 'DR_high'
        return tier
    }
    // DR unknown → domain-class fallback (best-effort).
    if (IL_TIER1_DOMAINS.has(domain)) return 'DR_high'
    if (IL_DIRECTORY_DOMAINS.has(domain)) return 'DR_low'
    return 'DR_mid'   // conservative midpoint
}

function resolveRelevance(domain: string, r: RawLinkRecord, drMap: Map<string, number>): 'high' | 'medium' | 'low' {
    if (IL_TIER1_DOMAINS.has(domain)) return 'high'
    if (String(r.type) === 'lost_link_recovery') return 'high'   // already linked us once
    const rank = drMap.get(domain)
    if (rank !== undefined && rank >= 200) return 'high'
    if (rank !== undefined && rank >= 50) return 'medium'
    return 'low'
}

// ── Scenario + budget ───────────────────────────────────────────────────────

function resolveScenario(rd: Record<string, unknown> | undefined): 'smart' | 'aggressive' {
    const cs = (rd?.chosenScenario as Record<string, unknown> | undefined) || {}
    const raw = String(cs.scenario || cs.key || cs.id || '').toLowerCase()
    return raw.includes('aggress') ? 'aggressive' : 'smart'
}

// ── Target pages from seo_keyword_research ──────────────────────────────────

interface TargetPage { label: string; anchorKeyword: string; cluster: string; opportunity: number }

function extractPriorityTargetPages(rd: Record<string, unknown> | undefined): TargetPage[] {
    const skr = ((rd?.results as Record<string, unknown> | undefined)?.seo_keyword_research as Record<string, unknown> | undefined)
    const records = (skr?.records as SkrRecord[] | undefined) || []
    // Money/linkable page types in the current seo_keyword_research taxonomy:
    // pillar + comparison_spoke + pricing_explainer + local_page are the pages
    // that earn from inbound link equity. (info_deep_spoke = informational,
    // weak link target; excluded.) Plus generic e-com types for other tenants.
    const commercialTypes = new Set([
        'pillar', 'comparison_spoke', 'pricing_explainer', 'local_page',
        'commercial', 'product', 'service', 'category', 'landing', 'homepage',
    ])
    const commercialIntents = new Set(['transactional', 'commercial_eval', 'local'])

    const scored = records
        .map(r => ({
            cluster: String(r.cluster || '').trim(),
            page_type: String(r.page_type || 'other').trim(),
            keyword: String(r.keyword || '').trim(),
            intent: skrIntent(r).trim(),
            opportunity: typeof r.opportunity === 'number'
                ? r.opportunity
                : (typeof r.opportunity === 'object' && r.opportunity ? Number((r.opportunity as { total?: number }).total) || 0 : 0),
        }))
        .filter(r => r.keyword && (commercialTypes.has(r.page_type) || commercialIntents.has(r.intent)))
        .sort((a, b) => b.opportunity - a.opportunity)

    // One target per cluster (keep highest opportunity), preserving order.
    const seen = new Set<string>()
    const out: TargetPage[] = []
    for (const r of scored) {
        const key = r.cluster || r.keyword
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
            label: `${r.cluster || r.keyword} (${r.page_type})`,
            anchorKeyword: r.keyword,
            cluster: r.cluster || r.keyword,
            opportunity: r.opportunity,
        })
    }
    return out
}

// ── Anchor distribution planner ─────────────────────────────────────────────

function planAnchorDistribution(
    n: number,
    overOpt: boolean,
    enriched: Array<{ dr: number | null; relevance: string }>,
): AnchorType[] {
    if (n === 0) return []
    // Healthy default vs over-optimization guard (drop new exact-match entirely).
    const mix: Record<AnchorType, number> = overOpt
        ? { branded: 0.60, partial: 0.30, exact: 0.0, generic: 0.10 }
        : { branded: 0.50, partial: 0.25, exact: 0.15, generic: 0.10 }

    // Convert to integer counts that sum to n.
    const counts: Record<AnchorType, number> = { branded: 0, partial: 0, exact: 0, generic: 0 }
    let assigned = 0
    for (const t of ['branded', 'partial', 'generic'] as AnchorType[]) {
        counts[t] = Math.round(mix[t] * n)
        assigned += counts[t]
    }
    counts.exact = Math.max(0, n - assigned)   // remainder → exact (0 when overOpt)
    if (overOpt && counts.exact > 0) { counts.branded += counts.exact; counts.exact = 0 }

    // Assign exact-match anchors to the HIGHEST-value prospects (high DR /
    // high relevance) — that's where an exact anchor earns the most, and we
    // keep their share small. Branded fills the rest.
    const byValue = [...enriched.keys()].sort((a, b) => {
        const va = (enriched[a].dr ?? 0) + (enriched[a].relevance === 'high' ? 50 : enriched[a].relevance === 'medium' ? 20 : 0)
        const vb = (enriched[b].dr ?? 0) + (enriched[b].relevance === 'high' ? 50 : enriched[b].relevance === 'medium' ? 20 : 0)
        return vb - va
    })
    const result: AnchorType[] = new Array(n).fill('branded')
    const queue: AnchorType[] = []
    for (let i = 0; i < counts.exact; i++) queue.push('exact')
    for (let i = 0; i < counts.partial; i++) queue.push('partial')
    for (let i = 0; i < counts.generic; i++) queue.push('generic')
    // exact → top value, then partial, then generic; remainder stays branded.
    byValue.forEach((idx, k) => { if (k < queue.length) result[idx] = queue[k] })
    return result
}

function composeAnchorText(type: AnchorType, keyword: string, businessName: string, domain: string): string {
    const kw = keyword || businessName
    switch (type) {
        case 'branded': return businessName
        case 'partial': return `${kw} | ${businessName}`
        case 'exact': return kw
        case 'generic': return 'למידע נוסף'
        default: { void domain; return businessName }
    }
}

// ── Sequencing ──────────────────────────────────────────────────────────────

function sequenceRank(e: { raw: RawLinkRecord; dr: number | null; domain: string }): number {
    const type = String(e.raw.type || '')
    if (type === 'lost_link_recovery') return 0
    if (type === 'link_gap_outreach') return 100 - (e.dr ?? 0)      // high-DR gap first
    if (IL_TIER1_DOMAINS.has(e.domain)) return 200
    if (type === 'anchor_remediation') return 300
    return 400
}

function averageLinkCost(enriched: Array<{ estimated_cost_ils: number }>): number {
    if (enriched.length === 0) return 1
    return enriched.reduce((s, e) => s + e.estimated_cost_ils, 0) / enriched.length
}

// ── tiny utils ──────────────────────────────────────────────────────────────

function tally<T extends string>(arr: T[]): Record<T, number> {
    return arr.reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m }, {} as Record<T, number>)
}