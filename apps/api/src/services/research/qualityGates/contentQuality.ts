/**
 * Phase 2026.01 — Content Quality post-stage validators (soft).
 *
 * Why: schema compliance (field exists in record) does NOT guarantee
 * senior-level strategic content. 4 cascades over Phase 2026.01 each passed
 * schema check yet missed AEO depth, tier-1 link sources, programmatic
 * city plan, CRO mechanisms, etc.
 *
 * These validators scan stage output AFTER it's persisted, emit
 * non-blocking warnings into `research_data.contentQualityWarnings[]`.
 * Surfaced in admin queue + UI banner so user knows what's weak.
 *
 * Hard cross-stage consistency (which CAN block downstream) lives in
 * crossStageConsistency.ts — separate file because semantics differ.
 *
 * Memory: [[schema-not-equal-strategy]]
 */

import type { StageId } from '../types'

export interface ContentQualityWarning {
    stageId: StageId
    severity: 'critical' | 'important' | 'enhancement'
    code: string
    title_he: string
    detail_he: string
    actionable_hint_he?: string
    surfaced_at: string
}

type Record_ = Record<string, unknown>

function rec(arr: unknown): Record_[] {
    return Array.isArray(arr) ? (arr as Record_[]) : []
}

function ext(obj: unknown): Record_ {
    return (obj && typeof obj === 'object') ? (obj as Record_) : {}
}

// ── Stage 1: competitor_landscape ─────────────────────────────────────────

export function validateCompetitorLandscape(stage: Record_): ContentQualityWarning[] {
    const out: ContentQualityWarning[] = []
    const records = rec(stage.records)
    const buckets = records.map(r => String(r.bucket || ''))
    const direct = buckets.filter(b => b === 'direct').length
    const adjacent = buckets.filter(b => b === 'adjacent').length
    const substitute = buckets.filter(b => b === 'substitute').length
    if (direct < 1) {
        out.push(warn('competitor_landscape', 'critical', 'no_direct_competitor',
            'אין מתחרה ישיר ב-records',
            'spec דורש לפחות 1 competitor ב-bucket="direct". ייתכן שהאלגוריתם פספס מתחרה ידוע בקטגוריה — בדקו תחילה.'))
    }
    if (adjacent < 1) {
        out.push(warn('competitor_landscape', 'important', 'no_adjacent_competitor',
            'אין מתחרה adjacent ב-records',
            'spec ממליץ ≥1 ב-bucket="adjacent" (אופציה חלופית מאותה JTBD). יכול לחשוף הרחבה אסטרטגית.'))
    }
    if (substitute < 1) {
        out.push(warn('competitor_landscape', 'important', 'no_substitute_competitor',
            'אין מתחרה substitute ב-records',
            'Phase 2026.01: ל-vertical עם commodity component (קרטונים, רהיטים יד שניה וכו) חובה substitute שמייצג free/used alternative (Yad2, קבוצות, שווקי יד 2). ללא record כזה — strategy מתעלמת מסגמנט-budget הדומיננטי.'))
    }
    // Phase 2026.01 — per-record minimum content (no junior shells)
    const recordsWithoutThreats = records.filter(r => {
        const t = r.threats_to_us
        return !Array.isArray(t) || (t as unknown[]).length < 1
    })
    const recordsWithoutGaps = records.filter(r => {
        const g = r.content_gaps_at_competitor
        return !Array.isArray(g) || (g as unknown[]).length < 1
    })
    if (recordsWithoutThreats.length > 0) {
        const names = recordsWithoutThreats.map(r => String(r.name || 'unnamed')).join(', ')
        out.push(warn('competitor_landscape', 'important', 'records_without_threats',
            `${recordsWithoutThreats.length} records ללא threats_to_us`,
            `Records ללא איומים: ${names}. גם unenriched competitors חייבים לפחות 1 threat hypothesis מבוסס bucket+domain.`))
    }
    if (recordsWithoutGaps.length > 0) {
        const names = recordsWithoutGaps.map(r => String(r.name || 'unnamed')).join(', ')
        out.push(warn('competitor_landscape', 'important', 'records_without_content_gaps',
            `${recordsWithoutGaps.length} records ללא content_gaps_at_competitor`,
            `Records ללא פערים: ${names}. גם unenriched competitors חייבים ≥1 content_gap hypothesis מבוסס vertical norms.`))
    }
    return out
}

// ── Stage 2: internal_seo_audit — 2026 senior IL signals ─────────────────

export function validateInternalSeoAudit(stage: Record_): ContentQualityWarning[] {
    const out: ContentQualityWarning[] = []
    const content = String(stage.content || '')
    const extras = ext(stage.extras)
    const records = rec(stage.records)

    // 2026 senior signals coverage checks (content + extras + records)
    // Use Hebrew + English variants to handle bilingual content
    const hasCwvOrInp = /\bINP\b|\bLCP\b|\bCWV\b|Core Web Vitals|מהירות טעינה|page_timing|page experience/i.test(content)
    const hasRtl = /RTL|dir="rtl"|<bdi>|logical CSS|hebrew direction/i.test(content) ||
        records.some(r => r.il_rtl_issues !== undefined)
    const hasHreflang = /hreflang|he-IL|en-IL/i.test(content)
    const hasGscReference = /GSC|Search Console|google search console|impressions|clicks/i.test(content) ||
        Boolean(extras.gsc_pages_integration_summary)
    const hasEeatQuadrant = records.some(r => {
        const q = (r.quadrant_scores as Record_ | undefined) || {}
        return typeof q.eeat === 'number'
    })

    if (!hasCwvOrInp) {
        out.push(warn('internal_seo_audit', 'critical', 'missing_core_web_vitals',
            'אין הזכרה של Core Web Vitals / INP / LCP באודיט',
            'Phase 2026.01: CWV+INP הם ranking factor 2024+. prefetch מספק page_timing per URL — חובה לנתח LCP > 2.5s / dom_complete > 5s URLs ולהוסיף core_web_vitals_fixes ל-tech_debt_summary.'))
    }
    if (!hasRtl) {
        out.push(warn('internal_seo_audit', 'critical', 'missing_rtl_audit',
            'אין הזכרה של RTL technical (dir/bdi/logical CSS) באודיט',
            'IL Hebrew RTL technical gotchas (iOS Safari direction bugs, missing <bdi> on numbers/URLs, physical-CSS-instead-of-logical) הם senior baseline. חובה ב-content + il_rtl_issues per record.'))
    }
    if (!hasHreflang) {
        out.push(warn('internal_seo_audit', 'important', 'missing_hreflang_check',
            'אין הזכרה של hreflang (he-IL/en-IL) באודיט',
            'גם אם site Hebrew-only — חובה לציין explicit (e.g. "hreflang לא נדרש — site מונולינגי"). senior audit לא משאיר שדה כזה ללא answer.'))
    }
    if (!hasGscReference) {
        out.push(warn('internal_seo_audit', 'important', 'gsc_not_integrated',
            'GSC top URLs לא מופיעים ב-narrative או extras',
            'Per Sergei\'s playbook: "audit STARTS with GSC, not crawl." Prefetch מספק 50 top-traffic URLs מ-GSC. חובה לציין מי מהם thin/missing-schema = priority refresh targets.'))
    }
    if (!hasEeatQuadrant) {
        out.push(warn('internal_seo_audit', 'important', 'missing_eeat_quadrant',
            'records חסרים quadrant_scores.eeat (E-E-A-T 4th quadrant)',
            'Phase 2026.01 senior audit = 4-quadrant (technical/content/authority/eeat). Records בלי eeat score = audit ב-3 צירים בלבד (2022 standard).'))
    }
    return out
}

// ── Stage 3: seo_keyword_research ─────────────────────────────────────────

export function validateSeoKeywordResearch(stage: Record_): ContentQualityWarning[] {
    const out: ContentQualityWarning[] = []
    const records = rec(stage.records)
    const intents = records.map(r => String(((r.intent as Record_ | undefined) || {}).primary || ''))
    const hasConversationalAio = intents.includes('conversational_aio')
    const hasLocal = intents.includes('local')
    if (!hasConversationalAio) {
        out.push(warn('seo_keyword_research', 'critical', 'missing_conversational_aio',
            'אין keyword עם intent="conversational_aio"',
            'AEO funnel חסר. 2026 spec דורש ≥1 keyword long-form FAQ-style ("איך, מה, האם"). זה ה-cornerstone ל-Hebrew AIO citation.'))
    }
    if (!hasLocal) {
        out.push(warn('seo_keyword_research', 'important', 'missing_local',
            'אין keyword עם intent="local"',
            'IL Local Pack לא יילקח. אם יש city presence — חובה ≥1 keyword עם intent=local (e.g. "X פתח תקווה").'))
    }
    // Striking distance honest constraints
    const strikingNoRealism = records.filter(r => {
        const sb = String(r.striking_bucket || '')
        return sb && sb !== 'null' && !r.striking_distance_realism
    }).length
    if (strikingNoRealism > 0) {
        out.push(warn('seo_keyword_research', 'important', 'striking_distance_no_realism',
            `${strikingNoRealism} striking-distance keywords ללא striking_distance_realism block`,
            'forecast יכול להבטיח top 3 ב-30-45 ימים בלי לבדוק backlink gap / DR מתחרים. ניהוג טוב חייב לכמת constraints.'))
    }
    return out
}

// ── Stage 4: aeo_visibility — MOST critical post-stage validator ──────────

const AEO_REQUIRED_TYPES = [
    'brand_entity_wikidata',
    'founder_person_schema',
    'definedterm_glossary',
    'comparison_claimreview',
    'bilingual_abstract',
    'cooccurrence_engineering',
] as const

export function validateAeoVisibility(stage: Record_): ContentQualityWarning[] {
    const out: ContentQualityWarning[] = []
    const records = rec(stage.records)
    const types = new Set(records.map(r => String(r.type || '')))
    const missing = AEO_REQUIRED_TYPES.filter(t => !types.has(t))
    if (missing.length > 0) {
        out.push(warn('aeo_visibility', 'critical', 'missing_2026_aeo_record_types',
            `חסרים ${missing.length} מבין ${AEO_REQUIRED_TYPES.length} מבני AEO 2026`,
            `Missing record types: ${missing.join(', ')}. כל אחד מהם הוא רכיב אסטרטגי ב-2026 AEO architecture (לא רק tactical). יש להריץ מחדש את Stage 4 כדי לקבל coverage מלא.`))
    }
    // Quotability scores presence
    const withoutQuotability = records.filter(r => typeof r.quotability_score_0_100 !== 'number').length
    if (withoutQuotability > 0 && records.length > 0) {
        out.push(warn('aeo_visibility', 'enhancement', 'missing_quotability_scores',
            `${withoutQuotability}/${records.length} records ללא quotability_score_0_100`,
            'Quotability score חיוני להעריך ROI של פעולה AEO לפני ביצוע. ללא הציון — אסור לקבל החלטה מבוססת.'))
    }
    if (records.length < 12) {
        out.push(warn('aeo_visibility', 'important', 'records_below_minimum',
            `records=${records.length}, spec דורש ≥12`,
            '2026 AEO architecture חיוב 12+ records: entity layer (3) + extraction (3) + authority (3) + measurement (3). פחות = lapse באחת מהשכבות.'))
    }
    return out
}

// ── Stage 5: link_audit ───────────────────────────────────────────────────

const TIER_1_CANONICAL = [
    'globes.co.il', 'calcalist.co.il', 'themarker.com',
    'mako.co.il', 'ynet.co.il', 'geektime.co.il',
] as const

export function validateLinkAudit(stage: Record_): ContentQualityWarning[] {
    const out: ContentQualityWarning[] = []
    const extras = ext(stage.extras)
    const tierTargets = ext(extras.il_tier_targets)
    const tier1Specific = rec(tierTargets.tier_1_specific_targets)
    if (tier1Specific.length < 2) {
        out.push(warn('link_audit', 'critical', 'insufficient_tier_1_targets',
            `tier_1_specific_targets=${tier1Specific.length}, spec דורש ≥2`,
            `Strategy must attempt ≥2 of: ${TIER_1_CANONICAL.join(', ')}. בלי tier-1 outreach attempt — strategy רק קוצרת tier-3 directories (low DR, no editorial weight).`))
    }
    // Verify pitches not generic
    const genericPitchPattern = /(we offer|אנחנו מציעים|חברה מובילה|nice to meet you)/i
    const genericPitches = tier1Specific.filter(t => {
        const angle = String(t.pitch_angle_he || '')
        return genericPitchPattern.test(angle) || angle.length < 100
    }).length
    if (tier1Specific.length > 0 && genericPitches > 0) {
        out.push(warn('link_audit', 'important', 'generic_tier_1_pitches',
            `${genericPitches}/${tier1Specific.length} tier-1 pitches generic או קצרים מ-100 תווים`,
            'Tier-1 editorial sources reject "we offer X" pitches instantly. דורש data-driven angle / industry-first / exclusive insight.'))
    }
    return out
}

// ── Stage 6: audience_personas — IL spec fields ──────────────────────────

export function validateAudiencePersonas(stage: Record_): ContentQualityWarning[] {
    const out: ContentQualityWarning[] = []
    const records = rec(stage.records)
    for (let i = 0; i < records.length; i++) {
        const p = records[i]
        const name = String(p.name || `record[${i}]`)
        if (!p.il_language_preference) {
            out.push(warn('audience_personas', 'important', `missing_il_language_preference_${i}`,
                `${name}: חסר il_language_preference`,
                '2026 IL spec דורש קביעת language preference (hebrew_primary / hebrew_with_english / russian_first / arabic_first).'))
        }
        if (!Array.isArray(p.trust_signal_priority) || (p.trust_signal_priority as unknown[]).length !== 5) {
            out.push(warn('audience_personas', 'important', `missing_trust_signal_priority_${i}`,
                `${name}: trust_signal_priority חסר/לא 5-items`,
                'spec דורש ordered array של 5 items מ-IL trust hierarchy.'))
        }
        const mob = Number(p.mobile_channel_share_pct)
        if (!Number.isFinite(mob) || mob < 50 || mob > 95) {
            out.push(warn('audience_personas', 'important', `mobile_share_out_of_range_${i}`,
                `${name}: mobile_channel_share_pct=${mob} מחוץ ל-50-95`,
                'IL 2026 = mobile-first. ערך מתחת ל-50 לא ריאלי; מעל 95 — חסר edge cases.'))
        }
    }
    return out
}

// ── Stage 9: strategy_options — 5 mandatory plan blocks ──────────────────

export function validateStrategyOptions(stage: Record_): ContentQualityWarning[] {
    const out: ContentQualityWarning[] = []
    const records = rec(stage.records)
    const required = [
        { key: 'programmatic_city_pages_plan', label: 'תוכנית programmatic city pages' },
        { key: 'cro_mechanisms', label: 'CRO mechanisms (GA4 events / WhatsApp / friction)' },
        { key: 'seasonality_play', label: 'IL seasonality plan (peak/low windows)' },
        { key: 'conversion_measurement_plan', label: 'תוכנית מדידה (Enhanced Conv / sGTM / Consent Mode v2)' },
        { key: 'comparison_pages_plan', label: 'תוכנית X-vs-Y comparison pages עם ClaimReview' },
    ]
    for (const r of records) {
        const scen = String(r.scenario || '')
        for (const req of required) {
            if (!r[req.key]) {
                out.push(warn('strategy_options', 'critical', `missing_${req.key}_${scen}`,
                    `${scen}: חסר ${req.label}`,
                    `Strategy ללא ${req.label} = junior-level. 2026 spec חובה.`))
            }
        }
    }
    return out
}

// ── Dispatcher ────────────────────────────────────────────────────────────

const VALIDATORS: Partial<Record<StageId, (stage: Record_) => ContentQualityWarning[]>> = {
    competitor_landscape: validateCompetitorLandscape,
    internal_seo_audit: validateInternalSeoAudit,
    seo_keyword_research: validateSeoKeywordResearch,
    aeo_visibility: validateAeoVisibility,
    link_audit: validateLinkAudit,
    audience_personas: validateAudiencePersonas,
    strategy_options: validateStrategyOptions,
}

export function validateStageContentQuality(stageId: StageId, stage: Record_): ContentQualityWarning[] {
    const fn = VALIDATORS[stageId]
    return fn ? fn(stage) : []
}

function warn(stageId: StageId, severity: ContentQualityWarning['severity'],
    code: string, title_he: string, detail_he: string, hint?: string): ContentQualityWarning {
    return {
        stageId,
        severity,
        code,
        title_he,
        detail_he,
        actionable_hint_he: hint,
        surfaced_at: new Date().toISOString(),
    }
}