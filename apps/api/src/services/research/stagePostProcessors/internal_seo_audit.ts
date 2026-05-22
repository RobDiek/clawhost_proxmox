/**
 * Post-LLM augmenter for internal_seo_audit stage records.
 *
 * Why post-LLM:
 *   LLMs are good at narrative + categorization. They are unreliable at
 *   deterministic arithmetic (priority_score = reach × impact × confidence
 *   / effort). We split the work:
 *     - LLM emits records[] with: page_type, issues_critical[], issues_warning[],
 *       priority_action, estimated_effort_hours, expected_impact, confidence
 *     - This augmenter computes:
 *         quadrant_scores  — 4-dim health view per record
 *         priority_score   — Reach × Impact × Confidence / Effort + IL mults
 *         il_multipliers_applied — which IL-context boosters fired
 *
 * All inputs come from records[] (LLM-emitted) and dfsData (deterministic
 * prefetch). No re-calling LLM, no new external IO.
 *
 * Defensive: missing or malformed fields fall back to safe defaults rather
 * than throw. Augmentation is best-effort.
 *
 * Spec: apps/api/specs/research-stages/internal_seo_audit.yaml v2026.01
 */

interface RawRecord {
    url?: string
    page_type?: string
    issues_critical?: string[]
    issues_warning?: string[]
    expected_impact?: 'minor' | 'medium' | 'high' | 'critical' | string
    confidence?: 'high' | 'medium' | 'working_hypothesis' | string
    estimated_effort_hours?: number
    word_count?: number
    onpage_score?: number
    schemas_present?: string[]
    h1_count?: number
    [k: string]: unknown
}

interface AggregateLike {
    crawledCount?: number
    avgWordCount?: number
}

interface IlSpecificLike {
    mobile_first_compliance?: number
    rtl_implementation_quality?: number
    hebrew_alt_text_coverage_pct?: number
}

export interface AugmentedRecord extends RawRecord {
    quadrant_scores: { technical: number; content: number; authority: number; eeat: number }
    priority_score: number
    priority_class: 'P0' | 'P1' | 'backlog'
    il_multipliers_applied: string[]
}

/**
 * Augment every record with deterministic per-record fields.
 * Returns a NEW array — does not mutate input.
 */
export function augmentInternalSeoAuditRecords(
    records: RawRecord[],
    dfsData: {
        aggregate?: AggregateLike
        ilSpecific?: IlSpecificLike
    } | undefined,
): AugmentedRecord[] {
    const totalRecords = Math.max(1, records.length)
    const ilSpec = dfsData?.ilSpecific || {}
    return records.map(r => augmentOne(r, totalRecords, ilSpec))
}

function augmentOne(r: RawRecord, totalRecords: number, ilSpec: IlSpecificLike): AugmentedRecord {
    const quadrant_scores = computeQuadrantScoresForRecord(r)
    const { score, multipliers, classBucket } = computePriorityScore(r, totalRecords, ilSpec)
    return {
        ...r,
        quadrant_scores,
        priority_score: Number(score.toFixed(2)),
        priority_class: classBucket,
        il_multipliers_applied: multipliers,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Quadrant scores per record (0-100 each)
// ────────────────────────────────────────────────────────────────────────────

function computeQuadrantScoresForRecord(r: RawRecord): AugmentedRecord['quadrant_scores'] {
    const issuesCritical = Array.isArray(r.issues_critical) ? r.issues_critical : []
    const issuesWarning  = Array.isArray(r.issues_warning) ? r.issues_warning : []
    const schemas        = Array.isArray(r.schemas_present) ? r.schemas_present : []
    const schemasLower   = schemas.map(s => String(s).toLowerCase())
    const onPageScore    = typeof r.onpage_score === 'number' ? r.onpage_score : 50
    const wordCount      = typeof r.word_count === 'number' ? r.word_count : 0
    const h1Count        = typeof r.h1_count === 'number' ? r.h1_count : 1

    // Technical: onpage_score - penalty per technical issue
    const technicalIssues = [
        'no_h1_tag', 'missing_canonical', 'is_redirect', 'is_4xx_code', 'is_5xx_code',
        'multiple_h1', 'no_meta_viewport', 'non_self_canonical', 'broken_resources',
    ]
    const technicalIssueCount = countMatching(issuesCritical, technicalIssues) + countMatching(issuesWarning, technicalIssues) * 0.5
    const technical = clamp(onPageScore - technicalIssueCount * 10)

    // Content: word_count + thin/duplicate penalties
    const contentIssues = ['thin_content', 'duplicate_title', 'duplicate_meta_description', 'duplicate_h1', 'missing_meta_description']
    const contentIssueCount = countMatching(issuesCritical, contentIssues) + countMatching(issuesWarning, contentIssues) * 0.5
    const wordScore = wordCount > 800 ? 100 : wordCount > 400 ? 75 : wordCount > 200 ? 50 : 25
    const content = clamp(wordScore - contentIssueCount * 15)

    // Authority: onpage_score (proxy until link_audit data is available per-URL)
    const authority = clamp(onPageScore)

    // E-E-A-T: schema presence (Organization + Person + Article + author info)
    let eeat = 0
    if (schemasLower.some(s => s === 'organization' || s === 'localbusiness')) eeat += 30
    if (schemasLower.some(s => s === 'person')) eeat += 25
    if (schemasLower.some(s => s === 'article')) eeat += 15
    if (schemasLower.some(s => s === 'breadcrumblist')) eeat += 10
    if (schemasLower.some(s => s === 'website')) eeat += 10
    if (h1Count === 1) eeat += 10   // Single H1 = signal of clean IA
    eeat = clamp(eeat)

    return { technical, content, authority, eeat }
}

// ────────────────────────────────────────────────────────────────────────────
// Priority score formula: (Reach × Impact × Confidence) / Effort × IL multipliers
// ────────────────────────────────────────────────────────────────────────────

const IMPACT_MAP: Record<string, number> = {
    minor: 0.2,
    medium: 0.5,
    high: 1.0,
    critical: 1.5,
}

const CONFIDENCE_MAP: Record<string, number> = {
    high: 0.9,
    medium: 0.7,
    working_hypothesis: 0.5,
}

function computePriorityScore(
    r: RawRecord,
    totalRecords: number,
    ilSpec: IlSpecificLike,
): { score: number; multipliers: string[]; classBucket: 'P0' | 'P1' | 'backlog' } {
    const issuesCritical = Array.isArray(r.issues_critical) ? r.issues_critical : []
    const issuesWarning  = Array.isArray(r.issues_warning) ? r.issues_warning : []
    const allIssues = [...issuesCritical, ...issuesWarning].map(s => String(s).toLowerCase())

    // Reach: per-page issues default 0.1; multi-page issues (like duplicate_title)
    // get a higher reach based on how common the issue is across the audit
    const isMultiPageIssue = issuesCritical.some(i => /duplicate|multiple_h1|missing_canonical|missing_meta/.test(String(i)))
    const reach = isMultiPageIssue ? 0.3 : 0.1
    // Bump reach if this URL is on a critical page type
    const criticalPageTypes = new Set(['homepage', 'product', 'pillar', 'pricing', 'service'])
    const pageType = String(r.page_type || 'other')
    const reachFinal = criticalPageTypes.has(pageType) ? Math.min(1.0, reach * 1.5) : reach

    // Impact
    const impact = IMPACT_MAP[String(r.expected_impact || 'medium')] ?? 0.5

    // Confidence
    const confidence = CONFIDENCE_MAP[String(r.confidence || 'medium')] ?? 0.7

    // Effort
    const effort = Math.max(0.5, Number(r.estimated_effort_hours) || 1.0)

    // Base score
    let score = (reachFinal * impact * confidence * 100) / effort
    const multipliers: string[] = []

    // IL multipliers per spec
    const mobileIssueKeywords = ['no_meta_viewport', 'lcp_too_high', 'page_too_slow', 'is_5xx_code']
    if (allIssues.some(i => mobileIssueKeywords.some(k => i.includes(k)))
        || (ilSpec.mobile_first_compliance ?? 100) < 70) {
        score *= 1.5
        multipliers.push('mobile_performance')
    }

    const rtlIssueKeywords = ['rtl_', 'hreflang', 'dir_attribute', 'bidi']
    if (allIssues.some(i => rtlIssueKeywords.some(k => i.includes(k)))) {
        score *= 1.3
        multipliers.push('rtl_implementation')
    }

    const hebrewIssueKeywords = ['no_image_alt', 'hebrew_content_quality']
    if (allIssues.some(i => hebrewIssueKeywords.some(k => i.includes(k)))) {
        score *= 1.3
        multipliers.push('hebrew_native_content')
    }

    const hcIssueKeywords = ['thin_content', 'duplicate_title', 'duplicate_meta_description', 'templated_meta']
    if (allIssues.some(i => hcIssueKeywords.some(k => i.includes(k)))) {
        score *= 1.4
        multipliers.push('helpful_content_signal')
    }

    const aeoIssueKeywords = ['no_schema', 'missing_product_schema', 'missing_organization_schema', 'missing_faq_schema']
    if (allIssues.some(i => aeoIssueKeywords.some(k => i.includes(k)))) {
        score *= 1.2
        multipliers.push('aeo_extractability')
    }

    void totalRecords  // reserved for future "page traffic share" reach computation

    // Classification per spec
    let classBucket: 'P0' | 'P1' | 'backlog'
    if (score >= 10) classBucket = 'P0'
    else if (score >= 5) classBucket = 'P1'
    else classBucket = 'backlog'

    return { score, multipliers, classBucket }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function countMatching(arr: string[], whitelist: string[]): number {
    if (!Array.isArray(arr)) return 0
    return arr.filter(s => whitelist.includes(String(s).toLowerCase())).length
}

function clamp(n: number): number {
    return Math.max(0, Math.min(100, Math.round(n)))
}