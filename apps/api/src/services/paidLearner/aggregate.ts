/**
 * Paid Performance Loop — aggregator.
 *
 * Phase 4.3 — reads resolved hypotheses (validated / rejected / inconclusive)
 * from the past N days for an instance and rolls them up per grouping
 * (by_code, by_code_platform, by_code_tier). Writes results to
 * paid_learnings table. Next opusAudit run reads top-confidence rows
 * via inject.ts and embeds Hebrew insights in the prompt.
 *
 * Pure SQL — no LLM. Cost: 0. Latency: <100ms typically.
 *
 * Discipline:
 *   - confidence='high' requires ≥10 resolved samples
 *   - confidence='medium' for 5-9 samples
 *   - confidence='low' for 1-4 samples
 *   - confidence='insufficient' if 0 samples
 * Only rows with confidence ≥ 'medium' get inject_into_prompts=TRUE.
 *
 * Discipline 2:
 *   - validation_rate is computed against (validated + rejected + inconclusive)
 *     NOT against (proposed). Inconclusive ≠ failure of engine.
 *   - decline_rate is the user-side signal: high decline_rate means
 *     proposals don't resonate (maybe wrong vertical heuristics).
 */

import { eq, and, sql, gte } from 'drizzle-orm'
import { db } from '@/db'
import { hypotheses, paidLearnings } from '@/db/schema'

const AGGREGATOR_VERSION = 'v1'

export type LearnerGrouping = 'by_code' | 'by_code_platform' | 'by_code_tier' | 'by_code_severity' | 'cross_code'

interface OutcomeBucket {
    proposed: number
    approved: number
    testing: number
    validated: number
    rejected: number
    inconclusive: number
    declined: number
    expired: number
    impactSum: number
    testWindowDays: number[]
}

function newBucket(): OutcomeBucket {
    return {
        proposed: 0, approved: 0, testing: 0,
        validated: 0, rejected: 0, inconclusive: 0,
        declined: 0, expired: 0,
        impactSum: 0,
        testWindowDays: [],
    }
}

function bumpBucket(b: OutcomeBucket, status: string, impactIls: number | null, testWindowDays: number | null) {
    b.proposed++   // any row in the result set was proposed at some point
    switch (status) {
        case 'approved':       b.approved++; break
        case 'testing':        b.testing++; break
        case 'validated':      b.validated++; break
        case 'rejected':       b.rejected++; break
        case 'inconclusive':   b.inconclusive++; break
        case 'declined':       b.declined++; break
        case 'expired':        b.expired++; break
    }
    if (impactIls !== null) b.impactSum += impactIls
    if (testWindowDays !== null && testWindowDays > 0) b.testWindowDays.push(testWindowDays)
}

function median(arr: number[]): number {
    if (arr.length === 0) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function classifyConfidence(sample: number): 'high' | 'medium' | 'low' | 'insufficient' {
    if (sample >= 10) return 'high'
    if (sample >= 5)  return 'medium'
    if (sample >= 1)  return 'low'
    return 'insufficient'
}

function buildInsightHe(opts: {
    grouping: LearnerGrouping
    groupKey: string
    groupLabelHe: string
    bucket: OutcomeBucket
}): string {
    const b = opts.bucket
    const resolved = b.validated + b.rejected + b.inconclusive
    if (resolved === 0) return ''
    const valRate = b.validated / resolved
    const inconcRate = b.inconclusive / resolved
    const declineRate = b.proposed > 0 ? b.declined / b.proposed : 0

    // Choose the most informative narrative angle
    if (valRate >= 0.7 && resolved >= 5) {
        return `${opts.groupLabelHe}: ${b.validated}/${resolved} validated (${Math.round(valRate * 100)}%). אסטרטגיה שעובדת — להמשיך להציע variations.`
    }
    if (valRate <= 0.2 && resolved >= 5) {
        return `${opts.groupLabelHe}: רק ${b.validated}/${resolved} validated (${Math.round(valRate * 100)}%). הסקה שעובדת חלש כאן — שקלו לעצור הצעה זו או לכתוב מחדש את הקריטריונים.`
    }
    if (inconcRate >= 0.5 && resolved >= 5) {
        return `${opts.groupLabelHe}: ${b.inconclusive}/${resolved} inconclusive (${Math.round(inconcRate * 100)}%). חוסר data — הצעות דורשות test_window ארוך יותר או min_conv threshold גבוה יותר.`
    }
    if (declineRate >= 0.6 && b.proposed >= 5) {
        return `${opts.groupLabelHe}: ${b.declined}/${b.proposed} declined (${Math.round(declineRate * 100)}%). הצעות אלה לא resonating — לחפש patterns ב-decline reasons.`
    }
    if (b.impactSum !== 0 && b.validated >= 3) {
        const dir = b.impactSum > 0 ? '+' : ''
        return `${opts.groupLabelHe}: ${b.validated} validated → ${dir}₪${Math.round(b.impactSum).toLocaleString()} impact aggregated.`
    }
    return `${opts.groupLabelHe}: ${b.validated} validated / ${b.rejected} rejected / ${b.inconclusive} inconclusive (n=${resolved}).`
}

// ─── Public entry: aggregate + persist ────────────────────────────────────

export interface AggregateOpts {
    instanceId: string
    /** Window length in days. Default 28d. */
    windowDays?: number
    agentId?: string | null
}

export interface AggregateResult {
    rowsWritten: number
    rowsUpdated: number
    rowsInsufficient: number
    rowsInjectable: number
    windowStart: string
    windowEnd: string
    sampleTotal: number
}

export async function aggregatePaidLearnings(opts: AggregateOpts): Promise<AggregateResult> {
    const windowDays = opts.windowDays || 28
    const now = new Date()
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
    const windowStartIso = windowStart.toISOString().slice(0, 10)
    const windowEndIso = now.toISOString().slice(0, 10)

    // 1. Pull resolved hypotheses in window
    const rows = await db.select({
        hypothesisCode: hypotheses.hypothesisCode,
        scopePlatform: hypotheses.scopePlatform,
        severity: hypotheses.severity,
        status: hypotheses.status,
        impactIls: hypotheses.outcomeImpactIls,
        testWindowDays: hypotheses.testWindowDays,
    })
        .from(hypotheses)
        .where(and(
            eq(hypotheses.instanceId, opts.instanceId),
            gte(hypotheses.proposedAt, windowStart),
        ))

    // 2. Build buckets per grouping
    const buckets = new Map<string, { grouping: LearnerGrouping; groupKey: string; groupLabelHe: string; bucket: OutcomeBucket }>()

    for (const row of rows) {
        const code = row.hypothesisCode
        const platform = row.scopePlatform || 'none'
        const sev = row.severity
        const impact = row.impactIls !== null ? Number(row.impactIls) : null
        const testDays = row.testWindowDays || null

        // by_code
        {
            const key = `by_code|${code}`
            if (!buckets.has(key)) {
                buckets.set(key, {
                    grouping: 'by_code', groupKey: code,
                    groupLabelHe: code,
                    bucket: newBucket(),
                })
            }
            bumpBucket(buckets.get(key)!.bucket, row.status, impact, testDays)
        }
        // by_code_platform
        {
            const key = `by_code_platform|${code}|${platform}`
            const labelHe = `${code} ב-${platform}`
            if (!buckets.has(key)) {
                buckets.set(key, {
                    grouping: 'by_code_platform', groupKey: `${code}|${platform}`,
                    groupLabelHe: labelHe, bucket: newBucket(),
                })
            }
            bumpBucket(buckets.get(key)!.bucket, row.status, impact, testDays)
        }
        // by_code_severity
        {
            const key = `by_code_severity|${code}|${sev}`
            const labelHe = `${code} (severity=${sev})`
            if (!buckets.has(key)) {
                buckets.set(key, {
                    grouping: 'by_code_severity', groupKey: `${code}|${sev}`,
                    groupLabelHe: labelHe, bucket: newBucket(),
                })
            }
            bumpBucket(buckets.get(key)!.bucket, row.status, impact, testDays)
        }
    }

    // cross_code — single row for entire instance
    if (rows.length > 0) {
        const bucket = newBucket()
        for (const row of rows) {
            const impact = row.impactIls !== null ? Number(row.impactIls) : null
            const testDays = row.testWindowDays || null
            bumpBucket(bucket, row.status, impact, testDays)
        }
        buckets.set('cross_code|all', {
            grouping: 'cross_code', groupKey: 'all',
            groupLabelHe: 'Engine accuracy (all hypotheses)',
            bucket,
        })
    }

    // 3. Persist (UPSERT into paid_learnings)
    let rowsWritten = 0
    let rowsUpdated = 0
    let rowsInsufficient = 0
    let rowsInjectable = 0

    for (const [, entry] of buckets) {
        const b = entry.bucket
        const resolved = b.validated + b.rejected + b.inconclusive
        const confidence = classifyConfidence(resolved)
        const valRate = resolved > 0 ? b.validated / resolved : null
        const declineRate = b.proposed > 0 ? b.declined / b.proposed : null
        const inconcRate = resolved > 0 ? b.inconclusive / resolved : null
        const insight = buildInsightHe({
            grouping: entry.grouping,
            groupKey: entry.groupKey,
            groupLabelHe: entry.groupLabelHe,
            bucket: b,
        })
        const inject = (confidence === 'high' || confidence === 'medium') && insight.length > 0

        if (confidence === 'insufficient') rowsInsufficient++
        if (inject) rowsInjectable++

        const valuesObj = {
            instanceId: opts.instanceId,
            agentId: opts.agentId ?? null,
            windowStart: windowStartIso,
            windowEnd: windowEndIso,
            windowGrain: `${windowDays}d`,
            grouping: entry.grouping,
            groupKey: entry.groupKey,
            groupLabelHe: entry.groupLabelHe,
            proposedCount: b.proposed,
            approvedCount: b.approved,
            testingCount: b.testing,
            validatedCount: b.validated,
            rejectedCount: b.rejected,
            inconclusiveCount: b.inconclusive,
            declinedCount: b.declined,
            expiredCount: b.expired,
            validationRate: valRate !== null ? String(valRate.toFixed(3)) : null,
            declineRate: declineRate !== null ? String(declineRate.toFixed(3)) : null,
            inconclusiveRate: inconcRate !== null ? String(inconcRate.toFixed(3)) : null,
            sumOutcomeImpactIls: b.impactSum !== 0 ? String(b.impactSum.toFixed(2)) : null,
            medianTestWindowDays: b.testWindowDays.length > 0 ? Math.round(median(b.testWindowDays)) : null,
            sampleSize: b.proposed,
            confidence,
            insightHe: insight,
            injectIntoPrompts: inject,
            aggregatorVersion: AGGREGATOR_VERSION,
        }

        // Use raw SQL UPSERT — schema unique index is (instance_id, grouping, group_key)
        const result = await db.execute(sql`
            INSERT INTO paid_learnings (
                instance_id, agent_id, window_start, window_end, window_grain,
                grouping, group_key, group_label_he,
                proposed_count, approved_count, testing_count,
                validated_count, rejected_count, inconclusive_count,
                declined_count, expired_count,
                validation_rate, decline_rate, inconclusive_rate,
                sum_outcome_impact_ils, median_test_window_days,
                sample_size, confidence,
                insight_he, inject_into_prompts,
                aggregator_version
            )
            VALUES (
                ${valuesObj.instanceId}, ${valuesObj.agentId},
                ${valuesObj.windowStart}::date, ${valuesObj.windowEnd}::date, ${valuesObj.windowGrain},
                ${valuesObj.grouping}, ${valuesObj.groupKey}, ${valuesObj.groupLabelHe},
                ${valuesObj.proposedCount}, ${valuesObj.approvedCount}, ${valuesObj.testingCount},
                ${valuesObj.validatedCount}, ${valuesObj.rejectedCount}, ${valuesObj.inconclusiveCount},
                ${valuesObj.declinedCount}, ${valuesObj.expiredCount},
                ${valuesObj.validationRate}::numeric, ${valuesObj.declineRate}::numeric, ${valuesObj.inconclusiveRate}::numeric,
                ${valuesObj.sumOutcomeImpactIls}::numeric, ${valuesObj.medianTestWindowDays},
                ${valuesObj.sampleSize}, ${valuesObj.confidence},
                ${valuesObj.insightHe}, ${valuesObj.injectIntoPrompts},
                ${valuesObj.aggregatorVersion}
            )
            ON CONFLICT (instance_id, grouping, group_key) DO UPDATE SET
                window_start = EXCLUDED.window_start,
                window_end = EXCLUDED.window_end,
                window_grain = EXCLUDED.window_grain,
                proposed_count = EXCLUDED.proposed_count,
                approved_count = EXCLUDED.approved_count,
                testing_count = EXCLUDED.testing_count,
                validated_count = EXCLUDED.validated_count,
                rejected_count = EXCLUDED.rejected_count,
                inconclusive_count = EXCLUDED.inconclusive_count,
                declined_count = EXCLUDED.declined_count,
                expired_count = EXCLUDED.expired_count,
                validation_rate = EXCLUDED.validation_rate,
                decline_rate = EXCLUDED.decline_rate,
                inconclusive_rate = EXCLUDED.inconclusive_rate,
                sum_outcome_impact_ils = EXCLUDED.sum_outcome_impact_ils,
                median_test_window_days = EXCLUDED.median_test_window_days,
                sample_size = EXCLUDED.sample_size,
                confidence = EXCLUDED.confidence,
                insight_he = EXCLUDED.insight_he,
                inject_into_prompts = EXCLUDED.inject_into_prompts,
                computed_at = NOW(),
                aggregator_version = EXCLUDED.aggregator_version
            RETURNING (xmax = 0) AS inserted
        `)

        const r = ((result as unknown) as { rows?: Array<{ inserted: boolean }> }).rows
        if (r && r[0]?.inserted) rowsWritten++
        else rowsUpdated++
    }

    return {
        rowsWritten,
        rowsUpdated,
        rowsInsufficient,
        rowsInjectable,
        windowStart: windowStartIso,
        windowEnd: windowEndIso,
        sampleTotal: rows.length,
    }
}