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
 * Resolves the primary mateh_agent for a VPS without needing a request
 * Context. Used by cron jobs / background tasks that don't have HTTP
 * scope — they always operate on the primary agent (the only one with
 * a stable identity for scheduled work).
 */
export async function resolvePrimaryAgent(vpsInstanceId: string): Promise<MatehAgentRow | null> {
    const [primary] = await db
        .select()
        .from(matehAgents)
        .where(and(eq(matehAgents.vpsInstanceId, vpsInstanceId), eq(matehAgents.isPrimary, true)))
    return primary || null
}

/**
 * Resolves a specific mateh_agent by id (validating it belongs to the
 * given VPS). Used by background jobs that were spawned with an
 * explicit agentId hint (e.g., scheduled tasks pinned to a specific
 * secondary agent).
 */
export async function resolveAgentById(
    vpsInstanceId: string,
    agentId: string,
): Promise<MatehAgentRow | null> {
    const [a] = await db
        .select()
        .from(matehAgents)
        .where(and(eq(matehAgents.id, agentId), eq(matehAgents.vpsInstanceId, vpsInstanceId)))
    return a || null
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

/**
 * Phase 2.3.B — research_data dual store.
 *
 * Centralizes all research_data writes so that:
 *   1. Per-agent state lands on mateh_agents.research_data (correct
 *      isolation between agents on the same VPS).
 *   2. For the PRIMARY agent only, we also mirror to instances.research_data
 *      so legacy callers (e.g. agentSetup utilities, n8n flows running on
 *      the VPS that read from /home/openclaw/.openclaw/research.json
 *      sourced from instances.research_data) continue to work.
 *
 * Replaces the ~25 ad-hoc `db.update(instances).set({ researchData: ... })`
 * call sites scattered through agentSetup.ts. Each caller now does:
 *
 *     const agent = await resolveActiveAgent(c, instanceId)
 *     await mutateResearchData(agent, instanceId, (rd) => ({ ...rd, foo: bar }))
 */

type ResearchData = Record<string, unknown>

/**
 * Returns the active agent's research_data (or {} if null/missing).
 * If no mateh_agents row exists for this VPS, falls back to instances.research_data
 * for backward compatibility with legacy un-backfilled instances.
 */
export async function readResearchData(
    agent: MatehAgentRow | null,
    instanceId: string,
): Promise<ResearchData> {
    if (agent) {
        return (agent.researchData as ResearchData) || {}
    }
    // Fallback: legacy instance with no agent row
    const { instances } = await import('@/db/schema')
    const [inst] = await db.select({ rd: instances.researchData }).from(instances).where(eq(instances.id, instanceId))
    return ((inst && inst.rd) as ResearchData) || {}
}

/**
 * Writes the given research_data object atomically to mateh_agents.research_data
 * (and mirrors to instances.research_data when the agent is primary).
 *
 * Caller can use this as a SET (overwrite) — for incremental merges, use
 * `mutateResearchData` which reads-then-merges-then-writes.
 */
export async function writeResearchData(
    agent: MatehAgentRow | null,
    instanceId: string,
    next: ResearchData,
): Promise<void> {
    if (agent) {
        await db.update(matehAgents)
            .set({ researchData: next as never, updatedAt: new Date() })
            .where(eq(matehAgents.id, agent.id))
        if (agent.isPrimary) {
            const { instances } = await import('@/db/schema')
            await db.update(instances)
                .set({ researchData: next as never })
                .where(eq(instances.id, instanceId))
        }
    } else {
        // Legacy fallback
        const { instances } = await import('@/db/schema')
        await db.update(instances)
            .set({ researchData: next as never })
            .where(eq(instances.id, instanceId))
    }
}

/**
 * Convenience: read → run mutator → write back. Used by callers that
 * want to merge new fields into research_data without losing existing keys.
 *
 * Usage:
 *   await mutateResearchData(agent, instanceId, (rd) =>
 *     ({ ...rd, contentPlan: plan, updatedAt: new Date().toISOString() }))
 *
 * Returns the next research_data object that was written (so caller can
 * inspect it without re-reading).
 */
export async function mutateResearchData(
    agent: MatehAgentRow | null,
    instanceId: string,
    mutator: (current: ResearchData) => ResearchData,
): Promise<ResearchData> {
    const current = await readResearchData(agent, instanceId)
    const next = mutator(current) || {}
    await writeResearchData(agent, instanceId, next)
    return next
}

/**
 * Phase 2.3.B — context-aware shim used to migrate legacy callers without
 * restructuring their handler shape. Pass `c` (Hono Context) and the
 * instanceId; the shim resolves the active agent (via ?agentId= or primary)
 * and writes research_data to the correct row.
 *
 * Drop-in replacement for:
 *
 *     await db.update(instances).set({ researchData: X as any })
 *         .where(eq(instances.id, instanceId))
 *
 * becomes:
 *
 *     await shimResearchWrite(c, instanceId, X)
 *
 * For compound updates that also touch other instance fields, use
 * `shimResearchWriteWithExtra` which accepts an extra `instanceFields`
 * map written to instances ALONGSIDE the agent write.
 */
export async function shimResearchWrite(
    c: Context,
    instanceId: string,
    next: ResearchData,
): Promise<void> {
    const agent = await resolveActiveAgent(c, instanceId)
    await writeResearchData(agent, instanceId, next)
}

/**
 * Phase 2.3.B — write a per-agent token/config field (googleTokens,
 * metaTokens, gscTokens, microsoftTokens, githubConfig) to the active
 * mateh_agent. For primary, also mirrors to instances.* so legacy
 * code paths reading from instance row stay consistent.
 */
export async function writeAgentTokens(
    c: Context,
    instanceId: string,
    fields: Partial<typeof matehAgents.$inferInsert>,
): Promise<void> {
    const agent = await resolveActiveAgent(c, instanceId)
    if (agent) {
        await db.update(matehAgents)
            .set({ ...fields, updatedAt: new Date() } as never)
            .where(eq(matehAgents.id, agent.id))
        if (agent.isPrimary) {
            const { instances } = await import('@/db/schema')
            await db.update(instances).set(fields as never).where(eq(instances.id, instanceId))
        }
    } else {
        // Legacy fallback
        const { instances } = await import('@/db/schema')
        await db.update(instances).set(fields as never).where(eq(instances.id, instanceId))
    }
}

export async function shimResearchWriteWithExtra(
    c: Context,
    instanceId: string,
    next: ResearchData,
    extraInstanceFields: Record<string, unknown>,
): Promise<void> {
    const agent = await resolveActiveAgent(c, instanceId)
    if (agent) {
        await db.update(matehAgents)
            .set({ researchData: next as never, updatedAt: new Date() })
            .where(eq(matehAgents.id, agent.id))
        const { instances } = await import('@/db/schema')
        // For primary agent, write extras + mirror research_data on instances.
        // For secondary agent, write ONLY the extras (researchData stays on agent).
        const fieldsToWrite = agent.isPrimary
            ? { ...extraInstanceFields, researchData: next }
            : extraInstanceFields
        if (Object.keys(fieldsToWrite).length > 0) {
            await db.update(instances)
                .set(fieldsToWrite as never)
                .where(eq(instances.id, instanceId))
        }
    } else {
        // Legacy fallback
        const { instances } = await import('@/db/schema')
        await db.update(instances)
            .set({ ...extraInstanceFields, researchData: next } as never)
            .where(eq(instances.id, instanceId))
    }
}