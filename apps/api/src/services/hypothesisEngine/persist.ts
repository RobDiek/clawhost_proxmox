/**
 * Hypothesis persistence layer.
 *
 * Single concern: write HypothesisProposal[] to the hypotheses table with
 * dedup discipline. The partial unique index `hypotheses_open_uniq`
 * (defined in migration 0055) prevents two open hypotheses with the same
 * (instance_id, hypothesis_code, scope_platform, scope_entity_id) — so on
 * conflict, we DO NOTHING (the previous proposal is still open; user hasn't
 * acted on it yet — don't churn).
 *
 * For closed (resolved/declined/expired) hypotheses, re-proposing the SAME
 * code+scope SHOULD succeed — the partial unique only covers OPEN states.
 * This gives a healthy loop: previous attempt rejected → generator can
 * re-propose if conditions still match → user gets a fresh attempt.
 */

import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { hypotheses } from '@/db/schema'
import type { HypothesisProposal } from './types'

export interface PersistResult {
    /** Number of proposals successfully inserted. */
    inserted: number
    /** Number that hit the open-state dedup constraint (silently skipped). */
    duplicatesSkipped: number
    /** Newly-inserted row IDs. */
    insertedIds: number[]
}

export async function persistProposals(
    instanceId: string,
    agentId: string | null,
    proposals: HypothesisProposal[],
): Promise<PersistResult> {
    if (proposals.length === 0) {
        return { inserted: 0, duplicatesSkipped: 0, insertedIds: [] }
    }

    // ── Pre-check: which (code, scope_platform, scope_entity_id) tuples
    // already have an open hypothesis? Skip those.
    const openExisting = await db
        .select({
            code: hypotheses.hypothesisCode,
            platform: hypotheses.scopePlatform,
            entityId: hypotheses.scopeEntityId,
        })
        .from(hypotheses)
        .where(and(
            eq(hypotheses.instanceId, instanceId),
            sql`status IN ('proposed', 'approved', 'testing')`,
        ))

    const openKeys = new Set(
        openExisting.map(r =>
            [r.code, r.platform || '', r.entityId || ''].join('|'),
        ),
    )

    const toInsert: HypothesisProposal[] = []
    let duplicatesSkipped = 0
    for (const p of proposals) {
        const key = [p.hypothesisCode, p.scopePlatform || '', p.scopeEntityId || ''].join('|')
        if (openKeys.has(key)) {
            duplicatesSkipped++
            continue
        }
        toInsert.push(p)
    }

    if (toInsert.length === 0) {
        return { inserted: 0, duplicatesSkipped, insertedIds: [] }
    }

    const records = toInsert.map(p => ({
        instanceId,
        agentId,
        hypothesisCode: p.hypothesisCode,
        title: p.title,
        titleHe: p.titleHe,
        scopePlatform: p.scopePlatform || null,
        scopeDataType: p.scopeDataType || null,
        scopeEntityId: p.scopeEntityId || null,
        scopeEntityName: p.scopeEntityName || null,
        scopeEventName: p.scopeEventName || null,
        scopeWindowStart: p.scopeWindow.start,
        scopeWindowEnd: p.scopeWindow.end,
        observation: p.observation,
        observationHe: p.observationHe,
        hypothesis: p.hypothesis,
        hypothesisHe: p.hypothesisHe,
        reasoning: p.reasoning,
        reasoningHe: p.reasoningHe,
        severity: p.severity,
        confidence: String(p.confidence.toFixed(3)),
        expectedImpactIls: p.expectedImpactIls !== undefined ? String(p.expectedImpactIls.toFixed(2)) : null,
        expectedImpactKind: p.expectedImpactKind || null,
        expectedImpactWindowDays: p.expectedImpactWindowDays || 30,
        evidenceSnapshot: p.evidenceSnapshot,
        evidenceQualityScore: p.evidenceQualityScore !== undefined ? String(p.evidenceQualityScore.toFixed(3)) : null,
        proposedAction: p.proposedAction,
        proposedActionHe: p.proposedActionHe,
        manualInstructions: p.manualInstructions || null,
        apiActionRecipe: p.apiActionRecipe || null,
        status: 'proposed' as const,
        testMethod: p.testMethod || null,
        testWindowDays: p.testWindowDays || null,
        testSuccessCriteria: p.testSuccessCriteria || null,
        source: p.source,
        generatedByModel: p.generatedByModel || null,
    }))

    const result = await db.insert(hypotheses).values(records as any).returning({ id: hypotheses.id })
    const insertedIds = result.map(r => r.id)

    return {
        inserted: insertedIds.length,
        duplicatesSkipped,
        insertedIds,
    }
}

// ─── Read helpers (for controllers + UI) ──────────────────────────────────

export async function listHypothesesForInstance(
    instanceId: string,
    opts?: { status?: string; limit?: number; offset?: number },
): Promise<any[]> {
    const limit = opts?.limit ?? 50
    const offset = opts?.offset ?? 0
    const conditions = [eq(hypotheses.instanceId, instanceId)]
    if (opts?.status) conditions.push(eq(hypotheses.status, opts.status))

    return db.select().from(hypotheses)
        .where(and(...conditions))
        .orderBy(sql`proposed_at DESC`)
        .limit(limit)
        .offset(offset)
}

export async function getHypothesis(instanceId: string, hypothesisId: number): Promise<any | null> {
    const [row] = await db.select().from(hypotheses)
        .where(and(
            eq(hypotheses.instanceId, instanceId),
            eq(hypotheses.id, hypothesisId),
        ))
        .limit(1)
    return row || null
}