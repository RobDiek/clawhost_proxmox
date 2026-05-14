/**
 * Hypothesis lifecycle state machine.
 *
 *   proposed ─approve──→ approved ─start_test──→ testing ─resolve──→ {validated|rejected|inconclusive}
 *      │                    │                        │
 *      ├─decline──→ declined│                        │
 *      ├─expire──→ expired  │                        │
 *      └─supersede─→ superseded
 *                           └─decline──→ declined
 *
 * Transitions allowed:
 *   proposed → approved | declined | expired | superseded
 *   approved → testing | declined
 *   testing  → validated | rejected | inconclusive
 *
 * Closed states (terminal):
 *   declined | expired | superseded | validated | rejected | inconclusive
 *
 * Re-running the engine against an instance with the same hypothesis_code on
 * the same scope while one is in {proposed, approved, testing} is a no-op
 * (the partial unique index hypotheses_open_uniq blocks it). After resolution
 * the next proposal is allowed.
 */

import { eq, and, sql } from 'drizzle-orm'
import { db } from '@/db'
import { hypotheses } from '@/db/schema'
import type { HypothesisStatus, TestSuccessCriteria } from './types'

const OPEN_STATES: HypothesisStatus[] = ['proposed', 'approved', 'testing']
const CLOSED_STATES: HypothesisStatus[] = ['declined', 'expired', 'superseded', 'validated', 'rejected', 'inconclusive']

const ALLOWED_TRANSITIONS: Record<HypothesisStatus, HypothesisStatus[]> = {
    proposed: ['approved', 'declined', 'expired', 'superseded'],
    approved: ['testing', 'declined'],
    testing: ['validated', 'rejected', 'inconclusive'],
    // Terminal states — no transitions out
    validated: [],
    rejected: [],
    inconclusive: [],
    declined: [],
    expired: [],
    superseded: [],
}

export function isOpen(status: HypothesisStatus): boolean {
    return OPEN_STATES.includes(status)
}

export function isClosed(status: HypothesisStatus): boolean {
    return CLOSED_STATES.includes(status)
}

export function canTransition(from: HypothesisStatus, to: HypothesisStatus): boolean {
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── State transition operations ──────────────────────────────────────────

/** User (or platform_auto) approves a proposed hypothesis. */
export async function approveHypothesis(
    hypothesisId: number,
    approvedBy: 'user' | 'platform_auto' = 'user',
): Promise<void> {
    const [row] = await db.select({ status: hypotheses.status })
        .from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1)
    if (!row) throw new Error(`Hypothesis ${hypothesisId} not found`)
    if (!canTransition(row.status as HypothesisStatus, 'approved')) {
        throw new Error(`Cannot approve hypothesis in status '${row.status}'`)
    }
    await db.update(hypotheses).set({
        status: 'approved',
        approvedAt: new Date(),
        approvedBy,
        updatedAt: new Date(),
    }).where(eq(hypotheses.id, hypothesisId))
}

/** User declines / dismisses the recommendation. */
export async function declineHypothesis(
    hypothesisId: number,
    reason?: string,
): Promise<void> {
    const [row] = await db.select({ status: hypotheses.status })
        .from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1)
    if (!row) throw new Error(`Hypothesis ${hypothesisId} not found`)
    if (!canTransition(row.status as HypothesisStatus, 'declined')) {
        throw new Error(`Cannot decline hypothesis in status '${row.status}'`)
    }
    await db.update(hypotheses).set({
        status: 'declined',
        declinedAt: new Date(),
        declinedReason: reason || null,
        updatedAt: new Date(),
    }).where(eq(hypotheses.id, hypothesisId))
}

/** Action delivered (manual instructions shown OR API call executed). Test window begins. */
export async function startTesting(hypothesisId: number): Promise<void> {
    const [row] = await db.select({
        status: hypotheses.status,
        testWindowDays: hypotheses.testWindowDays,
    }).from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1)
    if (!row) throw new Error(`Hypothesis ${hypothesisId} not found`)
    if (!canTransition(row.status as HypothesisStatus, 'testing')) {
        throw new Error(`Cannot start testing for hypothesis in status '${row.status}'`)
    }
    const now = new Date()
    const windowDays = row.testWindowDays || 14
    const evalDue = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000)
    await db.update(hypotheses).set({
        status: 'testing',
        testingStartedAt: now,
        testEvaluationDueAt: evalDue,
        updatedAt: now,
    }).where(eq(hypotheses.id, hypothesisId))
}

/** Resolver cron / manual call: evaluate criteria and close the hypothesis. */
export async function resolveHypothesis(
    hypothesisId: number,
    resolution: 'validated' | 'rejected' | 'inconclusive',
    outcome: {
        summary?: string
        summaryHe?: string
        impactIls?: number
        evidenceSnapshot?: Record<string, unknown>
    },
): Promise<void> {
    const [row] = await db.select({ status: hypotheses.status })
        .from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1)
    if (!row) throw new Error(`Hypothesis ${hypothesisId} not found`)
    if (!canTransition(row.status as HypothesisStatus, resolution)) {
        throw new Error(`Cannot resolve hypothesis in status '${row.status}' to '${resolution}'`)
    }
    await db.update(hypotheses).set({
        status: resolution,
        resolvedAt: new Date(),
        outcomeResolution: resolution,
        outcomeSummary: outcome.summary || null,
        outcomeSummaryHe: outcome.summaryHe || null,
        outcomeImpactIls: outcome.impactIls !== undefined ? String(outcome.impactIls) : null,
        outcomeEvidenceSnapshot: outcome.evidenceSnapshot || null,
        updatedAt: new Date(),
    }).where(eq(hypotheses.id, hypothesisId))
}

/** Mark an open hypothesis as superseded by a newer one on the same scope. */
export async function supersedeHypothesis(oldId: number, newId: number): Promise<void> {
    await db.update(hypotheses).set({
        status: 'superseded',
        supersededBy: newId,
        updatedAt: new Date(),
    }).where(and(
        eq(hypotheses.id, oldId),
        sql`status IN ('proposed', 'approved')`,   // can only supersede pre-testing
    ))
}

/**
 * Cron-callable: mark proposed-state hypotheses older than `maxAgeDays`
 * as expired. Default 30 days — if the user hasn't approved in a month,
 * the data is stale and a fresh proposal is more useful.
 */
export async function expireStaleProposals(maxAgeDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000)
    const result = await db.update(hypotheses).set({
        status: 'expired',
        updatedAt: new Date(),
    }).where(and(
        eq(hypotheses.status, 'proposed'),
        sql`proposed_at < ${cutoff}`,
    ))
    return (result as any).rowCount || 0
}

/**
 * Test criteria evaluation. Given a hypothesis and fresh metrics from after
 * the test window, decide validated / rejected / inconclusive.
 */
export function evaluateCriteria(
    criteria: TestSuccessCriteria,
    before: { metric: number | null; sampleSize: number; spendIls: number },
    after: { metric: number | null; sampleSize: number; spendIls: number },
): { resolution: 'validated' | 'rejected' | 'inconclusive'; reason: string } {
    // Inconclusive guards first — not enough data to call it either way
    if (criteria.minConv !== undefined && after.sampleSize < criteria.minConv) {
        return { resolution: 'inconclusive', reason: `post-test sample (${after.sampleSize}) below minimum ${criteria.minConv}` }
    }
    if (criteria.minSpendIls !== undefined && after.spendIls < criteria.minSpendIls) {
        return { resolution: 'inconclusive', reason: `post-test spend (₪${after.spendIls.toFixed(0)}) below minimum ₪${criteria.minSpendIls}` }
    }
    if (before.metric === null || after.metric === null) {
        return { resolution: 'inconclusive', reason: 'before or after metric unmeasurable' }
    }
    if (before.metric === 0) {
        // Avoid division by zero; treat as inconclusive
        return { resolution: 'inconclusive', reason: 'before metric was zero — cannot compute pct change' }
    }

    const pctChange = ((after.metric - before.metric) / before.metric) * 100
    const threshold = criteria.thresholdPct || 0

    if (criteria.direction === 'decrease') {
        if (pctChange <= -threshold) return { resolution: 'validated', reason: `metric dropped ${(-pctChange).toFixed(1)}% (≥ ${threshold}% threshold)` }
        return { resolution: 'rejected', reason: `metric changed ${pctChange.toFixed(1)}% (needed -${threshold}%)` }
    }
    if (criteria.direction === 'increase') {
        if (pctChange >= threshold) return { resolution: 'validated', reason: `metric rose ${pctChange.toFixed(1)}% (≥ ${threshold}% threshold)` }
        return { resolution: 'rejected', reason: `metric changed ${pctChange.toFixed(1)}% (needed +${threshold}%)` }
    }
    // no_worse_than
    if (pctChange >= -threshold) return { resolution: 'validated', reason: `metric held within -${threshold}% (changed ${pctChange.toFixed(1)}%)` }
    return { resolution: 'rejected', reason: `metric dropped ${(-pctChange).toFixed(1)}% (worse than -${threshold}% tolerance)` }
}