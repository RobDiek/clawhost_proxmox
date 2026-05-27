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
    const extras = ext(stage.extras)
    const records = rec(stage.records)

    // 2026 senior signals — checked via STRUCTURED FIELDS in extras
    // (fields beat prose — schema-enforced is the only way LLMs reliably comply)
    const hasCwvAudit = Boolean(extras.cwv_audit)
    const hasRtlAudit = Boolean(extras.rtl_audit)
    const hasHreflangAudit = Boolean(extras.hreflang_audit)
    const hasGscIntegration = Boolean(extras.gsc_pages_integration_summary)
    const hasEeatQuadrant = records.some(r => {
        const q = (r.quadrant_scores as Record_ | undefined) || {}
        return typeof q.eeat === 'number'
    })

    if (!hasCwvAudit) {
        out.push(warn('internal_seo_audit', 'critical', 'missing_cwv_audit',
            'extras.cwv_audit חסר — אין ניתוח Core Web Vitals + INP',
            'Phase 2026.01: CWV+INP הם ranking factor 2024+. prefetch מספק page_timing per URL — חובה לפלוט extras.cwv_audit עם lcp_critical_urls_count + inp_risk_urls_count + top_3_offending_urls + fixes_recommended_he.'))
    }
    if (!hasRtlAudit) {
        out.push(warn('internal_seo_audit', 'critical', 'missing_rtl_audit',
            'extras.rtl_audit חסר — אין בדיקת RTL technical',
            'IL Hebrew RTL technical gotchas (iOS Safari direction bugs, missing <bdi>, physical CSS) הם senior baseline. חובה ב-extras.rtl_audit עם html_dir_attribute + uses_logical_css + bdi_tags_present + rtl_specific_issues.'))
    }
    if (!hasHreflangAudit) {
        out.push(warn('internal_seo_audit', 'important', 'missing_hreflang_audit',
            'extras.hreflang_audit חסר — אין הצהרה על hreflang status',
            'גם אם site Hebrew-only — חובה לציין explicit status="not_required_monolingual". senior audit לא משאיר שדה כזה ללא answer.'))
    }
    if (!hasGscIntegration) {
        out.push(warn('internal_seo_audit', 'important', 'missing_gsc_integration',
            'extras.gsc_pages_integration_summary חסר',
            'Per Sergei\'s playbook: audit STARTS with GSC. Prefetch מספק 50 top-traffic URLs מ-GSC. חובה לפלוט traffic_priority_refresh_targets + orphan_in_production_count.'))
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

// ── Phase 2026.02 — Paid pipeline validators ───────────────────────────────

/**
 * Playbook §6.3 + §4.4.5 + §8.4 — paid_keyword_research must respect
 * upstream client_account_baseline's conv_value_quality_subscore. If < 30,
 * Smart Bidding (tCPA / Max Conversions / Max Conv Value) is forbidden
 * regardless of conv volume — signal is junk and bidding optimizer chases
 * polluted values. Manual CPC only until tracking fixed.
 *
 * Note: this validator does NOT itself fetch upstream baseline. Block 6
 * (paidConsistency hard validator) will cross-reference. Here we surface
 * a soft warning when Smart Bidding is recommended without an explicit
 * bid_strategy_blocked_until_tracking_fix=false (i.e. record didn't
 * acknowledge the gate at all).
 */
export function validatePaidKeywordResearch(stage: Record_): ContentQualityWarning[] {
    const out: ContentQualityWarning[] = []
    const records = rec(stage.records)
    if (records.length === 0) {
        out.push(warn('paid_keyword_research', 'critical', 'no_records',
            'אין ad group records', 'paid_keyword_research חזר ריק — אין seeds ל-campaign setup.'))
        return out
    }
    const SMART_BIDDING = new Set(['target_cpa', 'target_roas', 'max_conversions', 'max_conversion_value'])
    let smartBiddingCount = 0
    let acknowledgedGate = 0
    for (const r of records) {
        const strategy = String(r.bid_strategy_recommended || '').toLowerCase()
        if (SMART_BIDDING.has(strategy)) {
            smartBiddingCount++
            if (r.bid_strategy_blocked_until_tracking_fix !== undefined) {
                acknowledgedGate++
            }
        }
        // Per-keyword intent_classification (playbook §6.3 — 4-bucket taxonomy at keyword level)
        const keywords = rec(r.keywords)
        if (keywords.length > 0) {
            const withIntent = keywords.filter(k => typeof k.intent_classification === 'string').length
            if (withIntent < keywords.length / 2) {
                out.push(warn('paid_keyword_research', 'enhancement', `intent_classification_sparse_${r.ad_group_id || '?'}`,
                    `intent_classification חסר ב-${r.ad_group_label_he || r.ad_group_id || 'ad group'}`,
                    `Playbook §6.3 דורש intent_classification per-keyword (4-bucket: Informational/Navigational/Commercial/Transactional). פחות ממחצית מ-keywords כוללים זאת.`))
            }
        }
    }
    if (smartBiddingCount > 0 && acknowledgedGate < smartBiddingCount) {
        out.push(warn('paid_keyword_research', 'critical', 'smart_bidding_without_signal_gate',
            'Smart Bidding מומלץ ללא הצהרת bid_strategy_blocked_until_tracking_fix',
            `${smartBiddingCount} ad groups מציעים Smart Bidding (tCPA / Max Conversions). Playbook §4.4.5+§8.4: אם conv_value_quality_subscore < 30 → Smart Bidding אסור גם אם volume נראה גבוה. records חייבים להצהיר במפורש על bid_strategy_blocked_until_tracking_fix (true/false) ולהוכיח שקראו את upstream baseline.`,
            'בעת re-run של paid_keyword_research, ה-prompt דורש לקרוא upstream client_account_baseline.conv_value_quality_subscore_0_100.'))
    }
    return out
}

/**
 * Playbook §4-§5 + §6.5 — paid_audit 5-dim rubric validator.
 * Soft warnings only; hard validators (verdict-must-match-scores,
 * tracking-first-no-bidding-changes) live in paidConsistency.ts (Block 6).
 */
export function validatePaidAudit(stage: Record_): ContentQualityWarning[] {
    const out: ContentQualityWarning[] = []
    const records = rec(stage.records)
    const REQUIRED_DIMS = new Set(['structure', 'targeting', 'creative', 'measurement', 'bidding'])

    // 5-dim coverage check
    if (records.length === 0) {
        out.push(warn('paid_audit', 'critical', 'no_records',
            'אין dimension records', 'paid_audit חזר ריק — אין 5-dim scores לפי playbook §4.'))
        return out
    }
    const dimsPresent = new Set(records.map(r => String(r.dimension || '').toLowerCase()))
    for (const d of REQUIRED_DIMS) {
        if (!dimsPresent.has(d)) {
            out.push(warn('paid_audit', 'critical', `missing_dimension_${d}`,
                `dimension "${d}" חסר`,
                `Playbook §4 מחייב 5 dimensions מנדטוריים (Structure/Targeting/Creative/Measurement/Bidding). חסר "${d}".`))
        }
    }

    // Per-record evidence quality
    for (const r of records) {
        const dim = String(r.dimension || '')
        const score = typeof r.score_0_100 === 'number' ? r.score_0_100 : parseInt(String(r.score_0_100), 10)
        if (!Number.isFinite(score) || score < 0 || score > 100) {
            out.push(warn('paid_audit', 'critical', `invalid_score_${dim}`,
                `score לא תקין ל-${dim}`, `score_0_100 חייב להיות מספר 0-100, התקבל "${r.score_0_100}".`))
        }
        if (!r.evidence_he || String(r.evidence_he).length < 30) {
            out.push(warn('paid_audit', 'important', `evidence_too_thin_${dim}`,
                `${dim}: evidence_he חלשה מדי`,
                'evidence_he חייב להיות ≥30 chars + לצטט נתון ספציפי מ-upstream (baseline / kw / competitor).'))
        }
        if (!r.actionable_he || String(r.actionable_he).length < 20) {
            out.push(warn('paid_audit', 'important', `actionable_too_thin_${dim}`,
                `${dim}: actionable_he חלש`,
                'actionable_he חייב להיות ≥20 chars + fix קונקרטי, לא "improve creative".'))
        }
    }

    // Verdict logic check (extras-level)
    const extras = (stage.extras as Record<string, unknown> | undefined) || {}
    const totalScore = typeof extras.total_score_0_100 === 'number' ? extras.total_score_0_100
        : parseInt(String(extras.total_score_0_100 ?? ''), 10)
    const verdict = String(extras.verdict || '')
    const VALID_VERDICTS = new Set(['fix_tracking_first', 'optimize_incremental', 'restructure', 'rebuild_from_scratch'])
    if (!VALID_VERDICTS.has(verdict)) {
        out.push(warn('paid_audit', 'critical', 'invalid_verdict',
            `verdict "${verdict}" לא חוקי`,
            `Playbook §5.1 מגדיר 4 verdicts בלבד. התקבל "${verdict}".`))
    }

    // Verdict must match total_score per §5.1 (excluding measurement<30 override)
    const measurementRec = records.find(r => String(r.dimension).toLowerCase() === 'measurement')
    const measScore = measurementRec && (typeof measurementRec.score_0_100 === 'number'
        ? measurementRec.score_0_100 : parseInt(String(measurementRec.score_0_100), 10))
    if (Number.isFinite(measScore) && (measScore as number) < 30 && verdict !== 'fix_tracking_first') {
        out.push(warn('paid_audit', 'critical', 'measurement_low_verdict_mismatch',
            'measurement < 30 אבל verdict ≠ fix_tracking_first',
            `Playbook §4.4.4 hard rule: measurement_score=${measScore} < 30 → verdict חובה fix_tracking_first. התקבל "${verdict}".`))
    } else if (Number.isFinite(totalScore) && Number.isFinite(measScore) && (measScore as number) >= 30) {
        // Apply §5.1 thresholds
        if ((totalScore as number) >= 70 && verdict !== 'optimize_incremental') {
            out.push(warn('paid_audit', 'important', 'verdict_threshold_mismatch_high',
                `total=${totalScore} ≥70 אבל verdict="${verdict}"`,
                'Playbook §5.1: total ≥70 → optimize_incremental.'))
        } else if ((totalScore as number) < 40 && verdict !== 'rebuild_from_scratch') {
            out.push(warn('paid_audit', 'important', 'verdict_threshold_mismatch_low',
                `total=${totalScore} <40 אבל verdict="${verdict}"`,
                'Playbook §5.1: total <40 → rebuild_from_scratch.'))
        } else if ((totalScore as number) >= 40 && (totalScore as number) < 70 && verdict !== 'restructure') {
            out.push(warn('paid_audit', 'enhancement', 'verdict_threshold_mismatch_mid',
                `total=${totalScore} 40-70 אבל verdict="${verdict}"`,
                'Playbook §5.1: total 40-70 → restructure (unless edge case applies).'))
        }
    }

    // action_plan citation check (§6.5)
    const actionPlan = extras.action_plan as { changes?: unknown[]; measurement_fixes_first?: unknown[] } | undefined
    if (actionPlan?.changes && Array.isArray(actionPlan.changes)) {
        const noEvidence = actionPlan.changes.filter((ch: unknown) => {
            const c = ch as Record<string, unknown>
            return !c.evidence_source || String(c.evidence_source).length < 10
        }).length
        if (noEvidence > 0) {
            out.push(warn('paid_audit', 'important', 'action_plan_missing_evidence',
                `${noEvidence}/${actionPlan.changes.length} action plan changes ללא evidence_source`,
                'Playbook §7.1: action_plan.changes[*].evidence_source חייב לצטט baseline/kw/competitor field path.'))
        }
    }
    if (verdict === 'fix_tracking_first' && (!actionPlan?.measurement_fixes_first || (actionPlan.measurement_fixes_first as unknown[]).length < 3)) {
        out.push(warn('paid_audit', 'critical', 'tracking_first_insufficient_fixes',
            'verdict=fix_tracking_first אבל measurement_fixes_first < 3',
            'Playbook §5.3: fix_tracking_first verdict חייב ≥3 specific tracking gaps.'))
    }

    // IL mobile-first (§8.5)
    const mobileShareAssumed = typeof extras.il_mobile_share_assumed_pct === 'number' ? extras.il_mobile_share_assumed_pct : 0
    const mobileChangesCount = typeof extras.mobile_specific_changes_count === 'number' ? extras.mobile_specific_changes_count : 0
    if (mobileShareAssumed > 70 && mobileChangesCount < 1 && actionPlan?.changes && (actionPlan.changes as unknown[]).length > 0) {
        out.push(warn('paid_audit', 'critical', 'no_mobile_specific_action',
            'mobile_share > 70% אבל אין mobile-specific changes',
            'Playbook §8.5: IL mobile-first hard block. action plan חייב ≥1 mobile-specific item (WhatsApp ext / click-to-call / 9:16 Reels / LCP<2.5s).'))
    }

    return out
}

/** Playbook §6.2 — 4 buckets mandatory: direct / substitute / adjacent / reference. */
export function validatePaidCompetitorLandscape(stage: Record_): ContentQualityWarning[] {
    const out: ContentQualityWarning[] = []
    const records = rec(stage.records)
    if (records.length === 0) {
        out.push(warn('paid_competitor_landscape', 'critical', 'no_records',
            'אין competitor records', 'paid_competitor_landscape חזר ריק — strategic blind spot.'))
        return out
    }
    const buckets = new Set(records.map(r => String(r.bucket || '').toLowerCase()))
    const requiredBuckets = ['direct', 'substitute', 'adjacent', 'reference']
    for (const b of requiredBuckets) {
        if (!buckets.has(b)) {
            out.push(warn('paid_competitor_landscape', 'important', `missing_bucket_${b}`,
                `bucket "${b}" חסר`,
                `Playbook §6.2 מחייב 4 buckets (direct/substitute/adjacent/reference). חסר "${b}" — strategic blind spot. ל-reference: international leaders (U-Haul, Container Store, PODS) מגדירים סטנדרט גם אם לא מתחרים ב-IL.`,
                'הוסיפו record עם bucket="' + b + '" + רציונל.'))
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
    paid_competitor_landscape: validatePaidCompetitorLandscape,
    paid_keyword_research: validatePaidKeywordResearch,
    paid_audit: validatePaidAudit,
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