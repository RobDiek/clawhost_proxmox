/**
 * Deferred Actions store — K15
 *
 * Read/write deferredActions[] inside research_data via mutateResearchData.
 * Maintains both new generic store AND legacy adsBiddingHistory[] for
 * backwards compatibility during transition window.
 */

import type { DeferredAction, DeferredActionKind } from './types'

export async function recordDeferredAction<T>(
    instanceId: string,
    agentId: string | null,
    action: DeferredAction<T>,
): Promise<void> {
    const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } = await import('@/services/agentContext')
    const agent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)
    await mutateResearchData(agent, instanceId, (rd) => {
        const cast = rd as Record<string, unknown>
        if (!Array.isArray(cast.deferredActions)) cast.deferredActions = []
        ;(cast.deferredActions as DeferredAction[]).push(action as DeferredAction<unknown>)
        return rd
    })
}

export async function readDeferredActions(
    instanceId: string,
    agentId: string | null,
    filter?: { kind?: DeferredActionKind; state?: DeferredAction['state'] },
): Promise<DeferredAction[]> {
    const { resolveAgentById, resolvePrimaryAgent } = await import('@/services/agentContext')
    const agent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)
    const rd = ((agent?.researchData as Record<string, unknown>) || {})
    const raw: DeferredAction[] = Array.isArray(rd.deferredActions) ? (rd.deferredActions as DeferredAction[]) : []
    let filtered = raw
    if (filter?.kind) filtered = filtered.filter(a => a.kind === filter.kind)
    if (filter?.state) filtered = filtered.filter(a => a.state === filter.state)
    return filtered
}

export async function updateDeferredAction(
    instanceId: string,
    agentId: string | null,
    actionId: string,
    patch: Partial<DeferredAction>,
): Promise<boolean> {
    const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } = await import('@/services/agentContext')
    const agent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)
    let found = false
    await mutateResearchData(agent, instanceId, (rd) => {
        const cast = rd as Record<string, unknown>
        const list: DeferredAction[] = Array.isArray(cast.deferredActions) ? (cast.deferredActions as DeferredAction[]) : []
        const idx = list.findIndex(a => a.id === actionId)
        if (idx >= 0) {
            list[idx] = { ...list[idx], ...patch }
            cast.deferredActions = list
            found = true
        }
        return rd
    })
    return found
}

/**
 * One-time migration: copy legacy adsBiddingHistory[] entries into the
 * generic deferredActions[] store. Idempotent — skips entries with matching
 * ids already present.
 */
export async function migrateBiddingHistoryToDeferredActions(
    instanceId: string,
    agentId: string | null,
): Promise<{ migrated: number; skipped: number }> {
    const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } = await import('@/services/agentContext')
    const agent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)
    const stats = { migrated: 0, skipped: 0 }
    await mutateResearchData(agent, instanceId, (rd) => {
        const cast = rd as Record<string, unknown>
        const legacy = Array.isArray(cast.adsBiddingHistory)
            ? (cast.adsBiddingHistory as Array<Record<string, unknown>>)
            : []
        if (legacy.length === 0) return rd

        const existing: DeferredAction[] = Array.isArray(cast.deferredActions) ? (cast.deferredActions as DeferredAction[]) : []
        const existingIds = new Set(existing.map(a => a.id))

        for (const entry of legacy) {
            const id = String(entry.id || '')
            if (!id || existingIds.has(id)) { stats.skipped++; continue }
            const action: DeferredAction = {
                id,
                kind: 'bidding_strategy',
                appliedAt: String(entry.appliedAt || new Date().toISOString()),
                appliedBy: String(entry.appliedBy || 'system_migrate'),
                recoveryDays: Number(entry.recoveryDays || 14),
                payload: {
                    strategy: entry.strategy,
                    customerId: entry.customerId,
                    loginCustomerId: entry.loginCustomerId,
                    previousState: entry.previousState,
                    newState: entry.newState,
                    actionsApplied: entry.actionsApplied,
                },
                state: entry.restored
                    ? 'restored'
                    : entry.followupGenerated
                        ? 'followup_generated'
                        : 'active',
                followupGeneratedAt: (entry.followupGeneratedAt as string | null) || null,
                restoredAt: (entry.restoredAt as string | null) || null,
                dismissedAt: null,
            }
            existing.push(action)
            stats.migrated++
        }
        cast.deferredActions = existing
        return rd
    })
    return stats
}