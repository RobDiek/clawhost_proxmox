/**
 * Research plan endpoints — owns the plan/intent lifecycle on a per-instance
 * basis. Stage execution is dispatched separately via runStage.ts.
 *
 * Spec: docs/research-pipeline-design.md §7
 *
 *   GET    /hosting/instances/:id/research/plan
 *   POST   /hosting/instances/:id/research/plan          { intent? }
 *   POST   /hosting/instances/:id/research/plan/expand   { addIntents: [...] }
 *   DELETE /hosting/instances/:id/research/plan          (alias to resetResearch)
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from '../authHelper'
import { detectIntent, planForIntent, planForIntents } from '@/services/research/planResolver'
import { ALL_INTENTS } from '@/services/research/types'
import type { ResearchDataV2, ResearchIntent, ResearchPlan, StageId } from '@/services/research/types'

// ── GET /research/plan ────────────────────────────────────────────────────
// Returns current plan + per-stage status. Frontend pipeline widget polls
// this to render adaptive stage cards.
export const getResearchPlan = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!inst) return fail(c, 'Instance not found', 404)

        const rd = (inst.researchData as ResearchDataV2 | null) || {}
        return ok(c, {
            intent: rd.intent || null,
            plan: rd.plan || null,
            results: rd.results || {},
            // Surface answers so frontend can show "auto-detected from your profile"
            answers: rd.answers || null,
        })
    } catch (err) {
        console.error('getResearchPlan error:', err)
        return fail(c, 'Failed to read plan', 500)
    }
}

// ── POST /research/plan ───────────────────────────────────────────────────
// Initialize or replace the plan. Body { intent? } — when omitted, intent
// auto-detected from researchData.answers. Stages already in `results` keep
// their `completed` status; new stages get `pending`.
export const setResearchPlan = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ intent?: ResearchIntent }>().catch(() => ({} as { intent?: ResearchIntent }))

        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!inst) return fail(c, 'Instance not found', 404)

        const rd = (inst.researchData as ResearchDataV2 | null) || {}
        const intent: ResearchIntent =
            body.intent && (ALL_INTENTS as readonly string[]).includes(body.intent)
                ? body.intent
                : detectIntent(rd.answers)

        const stages = planForIntent(intent)
        const status: ResearchPlan['status'] = {}
        for (const stageId of stages) {
            const existing = rd.results?.[stageId]
            status[stageId] = existing
                ? { state: 'completed', runAt: existing.runAt }
                : (rd.plan?.status?.[stageId] ?? { state: 'pending' })
        }

        // Archive prior plan if intent actually changed.
        const archivedPlans = (rd.archivedPlans || []).slice()
        if (rd.plan && rd.intent && rd.intent !== intent) {
            archivedPlans.push(rd.plan)
        }

        const next: ResearchDataV2 = {
            ...rd,
            intent,
            plan: { stages, status },
            archivedPlans: archivedPlans.length > 0 ? archivedPlans : undefined,
        }

        await db.update(instances).set({ researchData: next as never }).where(eq(instances.id, instanceId))
        return ok(c, { intent, plan: next.plan }, 'Plan saved')
    } catch (err) {
        console.error('setResearchPlan error:', err)
        return fail(c, 'Failed to save plan', 500)
    }
}

// ── POST /research/plan/expand ────────────────────────────────────────────
// Add intents to current plan WITHOUT losing already-completed stages.
// Useful when a user starts SEO-only and decides to add paid_search later,
// or when an agent suggests adding aeo_visibility.
export const expandResearchPlan = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ addIntents: ResearchIntent[] }>()
            .catch(() => ({ addIntents: [] as ResearchIntent[] }))
        const validAdditions = (body.addIntents || []).filter(i => (ALL_INTENTS as readonly string[]).includes(i))
        if (validAdditions.length === 0) return fail(c, 'No valid intents to add', 400)

        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!inst) return fail(c, 'Instance not found', 404)

        const rd = (inst.researchData as ResearchDataV2 | null) || {}
        const current = rd.intent ? [rd.intent] : []
        const allIntents = [...new Set([...current, ...validAdditions])] as ResearchIntent[]
        const stages = planForIntents(allIntents)

        const status: ResearchPlan['status'] = {}
        for (const stageId of stages) {
            const existingStatus = rd.plan?.status?.[stageId]
            const hasResult = !!rd.results?.[stageId]
            status[stageId] = hasResult
                ? { state: 'completed', runAt: rd.results![stageId]!.runAt }
                : existingStatus ?? { state: 'pending' }
        }

        // When the channel mix expands, strategy must re-run so it reflects
        // the new universe. Reset strategy_options + validation to pending
        // (their previous content stays in results so user can compare).
        if (validAdditions.length > 0) {
            for (const sid of ['strategy_options', 'validation'] as StageId[]) {
                if (stages.includes(sid)) status[sid] = { state: 'pending' }
            }
        }

        // Promote multichannel marker if 3+ intents now active.
        const finalIntent: ResearchIntent = allIntents.length >= 3 ? 'multichannel' : (allIntents[0] || rd.intent || 'multichannel')

        const next: ResearchDataV2 = {
            ...rd,
            intent: finalIntent,
            plan: { stages, status },
        }
        await db.update(instances).set({ researchData: next as never }).where(eq(instances.id, instanceId))
        return ok(c, { intent: finalIntent, plan: next.plan }, 'Plan expanded')
    } catch (err) {
        console.error('expandResearchPlan error:', err)
        return fail(c, 'Failed to expand plan', 500)
    }
}