/**
 * Post-LLM augmenter for seo_keyword_research stage.
 *
 * Phase 2026.01 minimum-impact integration:
 *   - Runs Hebrew QA gate on key Hebrew fields per record (priority text)
 *   - Runs Quotability check on per-record narrative + aggregate
 *   - Surfaces findings as soft warnings in the stage output (does NOT
 *     mutate LLM records or break the save)
 *   - Validates intent classification follows 7-intent taxonomy (per spec)
 *
 * Spec: apps/api/specs/research-stages/seo_keyword_research.yaml v2026.01
 *
 * Future (deferred): LLM prompt rewrite to emit jtbd_moment + intent
 * 7-taxonomy + AIO triggers. Current LLM output uses legacy 3-tier
 * (TOFU/MOFU/BOFU) intent — augmenter maps that to closest 7-intent.
 */

import { checkHebrewQA } from '../qualityGates/hebrewQA'
import { scoreQuotability } from '../qualityGates/quotability'

interface RawKeywordRecord {
    keyword?: string
    intent?: string       // legacy: 'tofu' | 'mofu' | 'bofu' OR 7-taxonomy
    cluster?: string
    why?: string          // legacy "rationale" text in Hebrew
    why_chosen_he?: string
    jtbd_moment?: string
    rationale?: string
    [k: string]: unknown
}

export interface KeywordAugmentResult {
    augmented_records: RawKeywordRecord[]
    quality_findings: {
        hebrew_qa: {
            fields_checked: number
            fields_failed: number
            avg_score: number
            critical_findings: Array<{ keyword: string; field: string; description: string }>
        }
        quotability: {
            items_scored: number
            items_passed: number
            avg_score: number
            min_score: number
            low_score_items: Array<{ keyword: string; field: string; score: number }>
        }
        intent_distribution: Record<string, number>
        records_missing_jtbd: number
        conversational_aio_count: number
        seven_intent_compliance_pct: number
    }
}

// Map legacy 3-tier intents to closest 7-intent taxonomy
const LEGACY_INTENT_MAP: Record<string, string> = {
    'tofu': 'informational',
    'mofu': 'commercial_investigation',
    'bofu': 'transactional',
    'informational': 'informational',
    'navigational': 'navigational',
    'commercial': 'commercial_investigation',
    'commercial_investigation': 'commercial_investigation',
    'transactional': 'transactional',
    'local': 'local',
    'visual': 'visual',
    'conversational': 'conversational_aio',
    'conversational_aio': 'conversational_aio',
    'aio': 'conversational_aio',
}

const VALID_INTENTS = new Set([
    'informational', 'navigational', 'commercial_investigation',
    'transactional', 'local', 'visual', 'conversational_aio',
])

export function augmentKeywordResearchRecords(
    records: RawKeywordRecord[],
    ctx?: { brandName?: string },
): KeywordAugmentResult {
    const entityNames = ctx?.brandName ? [ctx.brandName] : undefined

    // 1. Hebrew QA + Quotability checks
    const hebrewFindings: Array<{ keyword: string; field: string; description: string }> = []
    const quotabilityItems: Array<{ keyword: string; field: string; score: number }> = []
    let hebrewFieldsChecked = 0
    let hebrewFieldsFailed = 0
    let hebrewScoreSum = 0
    let quotabilityScoreSum = 0
    let quotabilityCount = 0
    let quotabilityPassed = 0

    // 2. Intent distribution + normalize
    const intentDist: Record<string, number> = {}
    let recordsMissingJtbd = 0
    let conversationalAioCount = 0
    let sevenIntentCompliant = 0

    const augmentedRecords: RawKeywordRecord[] = []
    for (const r of records) {
        const out: RawKeywordRecord = { ...r }
        const kw = String(r.keyword || '?').slice(0, 60)

        // Normalize intent to 7-taxonomy
        const rawIntent = String(r.intent || '').toLowerCase()
        const normalizedIntent = LEGACY_INTENT_MAP[rawIntent] || null
        if (normalizedIntent && VALID_INTENTS.has(normalizedIntent)) {
            out.intent = normalizedIntent
            sevenIntentCompliant++
            if (normalizedIntent === 'conversational_aio') conversationalAioCount++
        }
        const finalIntent = String(out.intent || 'unknown')
        intentDist[finalIntent] = (intentDist[finalIntent] || 0) + 1

        // JTBD presence
        if (!r.jtbd_moment || String(r.jtbd_moment).trim().length === 0) {
            recordsMissingJtbd++
        }

        // Hebrew QA: check `why_chosen_he` / `rationale` / `why` / `jtbd_moment`
        const hebrewFields: Array<[string, string | undefined]> = [
            ['why_chosen_he', r.why_chosen_he as string | undefined],
            ['rationale', r.rationale as string | undefined],
            ['why', r.why as string | undefined],
            ['jtbd_moment', r.jtbd_moment as string | undefined],
        ]
        for (const [field, value] of hebrewFields) {
            if (!value || typeof value !== 'string' || value.trim().length === 0) continue
            hebrewFieldsChecked++
            const qa = checkHebrewQA(value)
            hebrewScoreSum += qa.score
            if (!qa.passes) hebrewFieldsFailed++
            for (const f of qa.findings) {
                if (f.severity === 'fail') {
                    hebrewFindings.push({ keyword: kw, field, description: f.description })
                }
            }
        }

        // Quotability — score short narrative fields
        const quotabilityFields: Array<[string, string | undefined]> = [
            ['why_chosen_he', r.why_chosen_he as string | undefined],
            ['rationale', r.rationale as string | undefined],
            ['jtbd_moment', r.jtbd_moment as string | undefined],
        ]
        for (const [field, value] of quotabilityFields) {
            if (!value || typeof value !== 'string' || value.trim().length === 0) continue
            const q = scoreQuotability(value, { entityNames })
            quotabilityScoreSum += q.score
            quotabilityCount++
            if (q.passes) quotabilityPassed++
            if (q.score < 50) {
                quotabilityItems.push({ keyword: kw, field, score: q.score })
            }
        }

        augmentedRecords.push(out)
    }

    const sevenIntentPct = records.length > 0
        ? Math.round((sevenIntentCompliant / records.length) * 100)
        : 0

    return {
        augmented_records: augmentedRecords,
        quality_findings: {
            hebrew_qa: {
                fields_checked: hebrewFieldsChecked,
                fields_failed: hebrewFieldsFailed,
                avg_score: hebrewFieldsChecked > 0 ? Math.round(hebrewScoreSum / hebrewFieldsChecked) : 0,
                critical_findings: hebrewFindings.slice(0, 20),  // cap
            },
            quotability: {
                items_scored: quotabilityCount,
                items_passed: quotabilityPassed,
                avg_score: quotabilityCount > 0 ? Math.round(quotabilityScoreSum / quotabilityCount) : 0,
                min_score: quotabilityItems.length > 0 ? Math.min(...quotabilityItems.map(i => i.score)) : 100,
                low_score_items: quotabilityItems.slice(0, 10),
            },
            intent_distribution: intentDist,
            records_missing_jtbd: recordsMissingJtbd,
            conversational_aio_count: conversationalAioCount,
            seven_intent_compliance_pct: sevenIntentPct,
        },
    }
}