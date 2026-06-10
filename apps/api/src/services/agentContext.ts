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
 * Canonical per-agent VPS paths. Single source of truth for the openclaw home,
 * config file, the gateway's $HOME, and the systemd unit — used by every
 * controller that writes channels/MCP/keys to a VPS so primary vs secondary
 * agents always hit the right gateway.
 *
 * `baseHome` = the gateway unit's Environment=HOME (matehAgentProvisioner.ts).
 * openclaw resolves config as $HOME/.openclaw, so any CLI invocation MUST run
 * with HOME=baseHome — NOT OPENCLAW_HOME=home: on openclaw 2026.6.x OPENCLAW_HOME
 * is treated as a base and `.openclaw` is appended → .openclaw/.openclaw, which
 * the gateway never reads → "Added" but "not configured" (silent no-op). Writing
 * the config FILE directly (configFile) is also safe (exact path the gateway reads).
 */
export function agentVpsPaths(agent: MatehAgentRow | null): {
    home: string
    baseHome: string
    configFile: string
    systemdUnit: string
} {
    if (!agent || agent.isPrimary) {
        return {
            home: '/home/openclaw/.openclaw',
            baseHome: '/home/openclaw',
            configFile: '/home/openclaw/.openclaw/openclaw.json',
            systemdUnit: 'openclaw-gateway',
        }
    }
    const agentDir = `/home/openclaw/agents/${agent.id}`
    const short = agent.id.slice(4)
    return {
        home: `${agentDir}/.openclaw`,
        baseHome: agentDir,
        configFile: `${agentDir}/.openclaw/openclaw.json`,
        systemdUnit: `openclaw-gateway-${short}`,
    }
}

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
        // Phase 2.2 — when data_home='vps', the on-VPS sovereign-store is the
        // read source. Central is kept identical via dual-write (P2.1), so any
        // miss/error transparently falls back to central — a read never breaks.
        try {
            const { instances } = await import('@/db/schema')
            const [inst] = await db.select({ dh: instances.dataHome }).from(instances).where(eq(instances.id, instanceId))
            if (inst?.dh === 'vps') {
                const { readResearchData: readSovereign } = await import('./sovereign/client')
                const remote = await readSovereign(instanceId, agent.id, 5000)
                if (remote && typeof remote === 'object') return remote as ResearchData
            }
        } catch (err) {
            console.error('[sovereign read] research_data → central fallback:', err instanceof Error ? err.message : err)
        }
        return (agent.researchData as ResearchData) || {}
    }
    // Fallback: legacy instance with no agent row
    const { instances } = await import('@/db/schema')
    const [inst] = await db.select({ rd: instances.researchData }).from(instances).where(eq(instances.id, instanceId))
    return ((inst && inst.rd) as ResearchData) || {}
}

/**
 * Phase 4.3-O systemic-fix: convenience helper for controllers handling HTTP
 * requests. Resolves the ACTIVE agent (honoring ?agentId= query) and returns
 * that agent's research_data.
 *
 * USE THIS in any HTTP controller that reads research_data scoped to a request
 * (i.e. anywhere you'd otherwise write `inst.researchData`). The direct
 * `instances.researchData` is only the PRIMARY agent's mirror — for secondary
 * agents (multi-agent VPS topology) it returns the wrong data.
 *
 * Exception: cron jobs / background tasks that operate on the primary by
 * design should use `resolvePrimaryAgent` + `readResearchData` explicitly.
 *
 * @example
 *   // Bad — silently uses primary's data for secondary agents:
 *   const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
 *   const rd = inst.researchData || {}
 *
 *   // Good — scoped to whichever agent the request targets:
 *   const { rd, agent } = await readResearchDataForActive(c, instanceId)
 */
export async function readResearchDataForActive(
    c: Context,
    instanceId: string,
): Promise<{ rd: ResearchData; agent: MatehAgentRow | null }> {
    const agent = await resolveActiveAgent(c, instanceId)
    const rd = await readResearchData(agent, instanceId)
    return { rd, agent }
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
    // Phase 2.1 — best-effort shadow to the on-VPS sovereign-store when this
    // instance's data_home != 'central'. Never throws; central stays canonical.
    // Scope = agent id (per-agent research_data) with instanceId as legacy fallback.
    const { shadowResearchData } = await import('./sovereign/dualWrite')
    await shadowResearchData(instanceId, agent?.id ?? instanceId, next)
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
    // CRITICAL — read FRESH from DB, not from the (possibly stale) in-memory
    // agent.researchData snapshot. Without this fresh read, a long-running
    // adapter that calls multiple mutateResearchData operations interleaved
    // with other writers (e.g. monthlyTaskExecutor mark-in-progress →
    // saveGtmSetupResult → mark-completed) silently loses intermediate
    // writes: each mutator() reads the OLD agent.researchData snapshot,
    // patches it, and writes — overwriting any side-effects from another
    // mutator call that ran in between with the same stale base.
    //
    // The behavior matched a memory we already had:
    //   feedback_research_data_dual_write — ALL writes to research_data MUST
    //   use mutateResearchData/writeResearchData. Raw db.update gets silently
    //   wiped by next patchResearchData call.
    // The underlying mechanism is the stale in-memory read — fixed here so
    // every mutator gets a true current state to merge into.
    let current: ResearchData
    if (agent) {
        const [fresh] = await db.select({ rd: matehAgents.researchData })
            .from(matehAgents)
            .where(eq(matehAgents.id, agent.id))
        current = (fresh ? fresh.rd as ResearchData : null) || {}
    } else {
        const { instances } = await import('@/db/schema')
        const [inst] = await db.select({ rd: instances.researchData })
            .from(instances)
            .where(eq(instances.id, instanceId))
        current = (inst ? inst.rd as ResearchData : null) || {}
    }
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

/**
 * Phase 4.3-P — Google Ads config dual store (per-agent).
 *
 * Until Phase 4.3-P `instances.googleAdsConfig` was the only home for the
 * customerId / loginCustomerId / developerToken + the chosen scope
 * (operatingCustomerId + campaignIds). On multi-MATEH VPSes that meant the
 * secondary agent's UI showed the PRIMARY agent's operating account and
 * campaign list — and any publish from the secondary would write to the
 * wrong campaigns. The migration moves the canonical row to mateh_agents.
 *
 * Use these helpers anywhere code touches `googleAdsConfig` / `googleAdsMode`
 * so we never accidentally reach back into the instance-level mirror.
 */

export interface GoogleAdsConfig {
    customerId?: string
    loginCustomerId?: string
    developerToken?: string
    linkedAt?: string
    mccSubAccountId?: string
    scope?: {
        // Historical values seen in prod: 'campaigns' (allowlist) or
        // 'account'/'all' (use the entire account). Treat anything not
        // 'campaigns' as 'all'.
        mode?: string
        operatingCustomerId?: string
        campaignIds?: string[]
        selectedAt?: string
        selectedBy?: string | null
    }
    [k: string]: unknown
}

export async function readGoogleAdsConfig(
    agent: MatehAgentRow | null,
    instanceId: string,
): Promise<{ config: GoogleAdsConfig | null; mode: string | null }> {
    if (agent) {
        const cfg = (agent.googleAdsConfig as GoogleAdsConfig | null) || null
        const mode = (agent.googleAdsMode as string | null) || null
        if (cfg || mode) return { config: cfg, mode }
        // Pre-migration fallback (legacy primary whose row was backfilled but
        // is still NULL because the migration ran AFTER the row was created):
        // read from instances.googleAdsConfig if this is the primary.
        if (agent.isPrimary) {
            const { instances } = await import('@/db/schema')
            const [inst] = await db
                .select({ cfg: instances.googleAdsConfig, mode: instances.googleAdsMode })
                .from(instances)
                .where(eq(instances.id, instanceId))
            return { config: ((inst?.cfg as GoogleAdsConfig | null) || null), mode: inst?.mode || null }
        }
        // Secondary with no config = honestly disconnected. Do NOT fall back
        // to the instance mirror — that's the primary's, and reading it is
        // exactly the leak this migration fixes.
        return { config: null, mode: null }
    }
    // No agent row at all (very old legacy instance): use instance mirror.
    const { instances } = await import('@/db/schema')
    const [inst] = await db
        .select({ cfg: instances.googleAdsConfig, mode: instances.googleAdsMode })
        .from(instances)
        .where(eq(instances.id, instanceId))
    return { config: ((inst?.cfg as GoogleAdsConfig | null) || null), mode: inst?.mode || null }
}

/**
 * Same as readGoogleAdsConfig but resolves the active agent from the Hono
 * Context (?agentId= aware). Drop-in for controllers.
 */
export async function readGoogleAdsConfigForActive(
    c: Context,
    instanceId: string,
): Promise<{ config: GoogleAdsConfig | null; mode: string | null; agent: MatehAgentRow | null }> {
    const agent = await resolveActiveAgent(c, instanceId)
    const { config, mode } = await readGoogleAdsConfig(agent, instanceId)
    return { config, mode, agent }
}

/**
 * Write Google Ads config + mode to the active agent. Mirrors to the
 * instances row only when the agent is primary (legacy callers like the
 * VPS-side n8n config sync read from there).
 */
export async function writeGoogleAdsConfig(
    agent: MatehAgentRow | null,
    instanceId: string,
    next: { config?: GoogleAdsConfig | null; mode?: string | null },
): Promise<void> {
    const fields: Record<string, unknown> = {}
    if ('config' in next) fields.googleAdsConfig = next.config as never
    if ('mode' in next) fields.googleAdsMode = next.mode as never
    if (Object.keys(fields).length === 0) return

    if (agent) {
        await db.update(matehAgents)
            .set({ ...fields, updatedAt: new Date() } as never)
            .where(eq(matehAgents.id, agent.id))
        if (agent.isPrimary) {
            const { instances } = await import('@/db/schema')
            await db.update(instances).set(fields as never).where(eq(instances.id, instanceId))
        }
    } else {
        // Legacy fallback — no agent row exists.
        const { instances } = await import('@/db/schema')
        await db.update(instances).set(fields as never).where(eq(instances.id, instanceId))
    }
}

/**
 * Phase 2.3.J — write tokens to a SPECIFIC mateh_agent by id, bypassing
 * the Context-based resolver. Required for OAuth callback handlers where
 * the request comes from Google/Meta/etc with no `?agentId=` (it must be
 * round-tripped through the OAuth `state` payload instead).
 *
 * Without this, callbacks always wrote to the primary agent regardless of
 * which secondary the user was on when they started the OAuth flow.
 */
export async function writeAgentTokensFor(
    agentId: string,
    instanceId: string,
    fields: Partial<typeof matehAgents.$inferInsert>,
): Promise<void> {
    const [agent] = await db
        .select()
        .from(matehAgents)
        .where(and(eq(matehAgents.id, agentId), eq(matehAgents.vpsInstanceId, instanceId)))
    if (!agent) {
        // Caller passed a stale agentId — fall back to legacy instance write
        // so we don't silently drop the tokens.
        const { instances } = await import('@/db/schema')
        await db.update(instances).set(fields as never).where(eq(instances.id, instanceId))
        return
    }
    await db.update(matehAgents)
        .set({ ...fields, updatedAt: new Date() } as never)
        .where(eq(matehAgents.id, agent.id))
    if (agent.isPrimary) {
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