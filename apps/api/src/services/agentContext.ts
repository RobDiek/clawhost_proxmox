/**
 * Phase 2.3.A — agent context resolver.
 *
 * Helper that resolves the active mateh_agent for a request given the
 * VPS instanceId path param + an optional `?agentId=` query param.
 *
 * Resolution rules:
 *   - If `?agentId=mta_xxx` is present AND that agent belongs to the
 *     given VPS → return that agent (secondary or primary).
 *   - Otherwise → return the PRIMARY mateh_agent for this VPS.
 *   - If no primary exists yet (legacy instance not yet backfilled) →
 *     return null. Caller falls back to instances.* (legacy path).
 *
 * Used by all per-agent endpoints to pivot read/write to the right
 * mateh_agents row. Per-agent fields (research_data, ai_provider_key,
 * subAgentModels, schedules, telegram*, google_tokens, meta_tokens, etc.)
 * are now sourced from the resolved row instead of `instances.*`.
 */

import type { Context } from 'hono'
import { db } from '@/db'
import { matehAgents, type instances } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export type MatehAgentRow = typeof matehAgents.$inferSelect
export type InstanceRow = typeof instances.$inferSelect

/**
 * Resolves which mateh_agents row to operate on for this request.
 * Looks up by `?agentId=` if provided (and validates it belongs to the
 * given VPS), otherwise returns the primary agent for the VPS.
 *
 * Returns null if no agent row exists for this VPS yet (means the
 * instance was never backfilled — caller should fall back to legacy
 * path and read/write `instances.*` directly).
 */
export async function resolveActiveAgent(
    c: Context,
    vpsInstanceId: string,
): Promise<MatehAgentRow | null> {
    const queryAgentId = (c.req.query('agentId') || '').trim()
    if (queryAgentId) {
        const [a] = await db
            .select()
            .from(matehAgents)
            .where(and(eq(matehAgents.id, queryAgentId), eq(matehAgents.vpsInstanceId, vpsInstanceId)))
        if (a) return a
        // agentId given but doesn't belong to this VPS — treat as bad input,
        // not a security issue (the VPS-level auth still applies).
    }
    const [primary] = await db
        .select()
        .from(matehAgents)
        .where(and(eq(matehAgents.vpsInstanceId, vpsInstanceId), eq(matehAgents.isPrimary, true)))
    return primary || null
}

/**
 * Same as resolveActiveAgent but reads agentId from the request body
 * when present (some POST endpoints prefer body over query). Falls
 * back to query param then primary.
 */
export async function resolveActiveAgentFromBody(
    c: Context,
    vpsInstanceId: string,
    body: Record<string, unknown> | null,
): Promise<MatehAgentRow | null> {
    const bodyAgentId = body && typeof body.agentId === 'string' && body.agentId ? body.agentId : null
    if (bodyAgentId) {
        const [a] = await db
            .select()
            .from(matehAgents)
            .where(and(eq(matehAgents.id, bodyAgentId), eq(matehAgents.vpsInstanceId, vpsInstanceId)))
        if (a) return a
    }
    return resolveActiveAgent(c, vpsInstanceId)
}

/**
 * Updates per-agent fields on the resolved agent row. Centralizes the
 * dual-write pattern: writes always go to mateh_agents.*, but for the
 * PRIMARY agent we also mirror to instances.* for backward-compat with
 * legacy code paths that haven't been migrated yet.
 */
export async function updateAgentField<K extends keyof typeof matehAgents.$inferInsert>(
    agent: MatehAgentRow,
    fields: Partial<Pick<typeof matehAgents.$inferInsert, K>>,
    legacyMirror?: { instanceId: string; instanceFields: Record<string, unknown> },
): Promise<void> {
    await db.update(matehAgents)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(matehAgents.id, agent.id))
    // If this is the primary agent and a legacy mirror is requested,
    // also write the same fields to the instances row so that legacy
    // code paths reading from instances.* continue to see consistent state.
    if (agent.isPrimary && legacyMirror) {
        const { instanceId, instanceFields } = legacyMirror
        const { instances } = await import('@/db/schema')
        await db.update(instances)
            .set(instanceFields as never)
            .where(eq(instances.id, instanceId))
    }
}