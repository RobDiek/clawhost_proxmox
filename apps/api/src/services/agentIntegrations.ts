/**
 * Agent Integrations Service
 *
 * Per-agent integration storage. Each agent (oc, mt, bare) has its own
 * set of integrations (telegram, google, meta, etc.) stored in the
 * agent_integrations table.
 *
 * This replaces the old pattern of storing all integrations directly
 * on the instances table (where they were shared across all agents).
 *
 * For backwards compatibility, write operations update BOTH:
 * 1. agent_integrations table (new, per-agent)
 * 2. instances table legacy fields (old, for code that hasn't migrated yet)
 */

import { db } from '@/db'
import { agentIntegrations, instances } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export type AgentType = 'oc' | 'mt' | 'bare'
export type IntegrationType = 'telegram' | 'google' | 'meta' | 'microsoft' | 'whatsapp' | 'gbp' | 'api_key' | 'brave' | 'smtp' | 'wordpress' | 'gsc' | 'dataforseo' | 'firecrawl' | 'reddit' | 'resend' | 'replicate' | 'brightdata' | 'gemini' | 'canva'

/**
 * Get a specific integration for an agent.
 * Phase 2.3.D — when agentId is provided, look up by agent_id (primary key
 * for the new unique constraint). Older callers passing only agentType get
 * resolved to the primary mateh_agent for back-compat.
 */
export async function getAgentIntegration(
    instanceId: string,
    agentType: AgentType,
    integrationType: IntegrationType,
    agentId: string | null | undefined,
): Promise<{ config: Record<string, unknown>; status: string } | null> {
    let resolvedAgentId = agentId || null
    if (!resolvedAgentId) {
        const { resolvePrimaryAgent } = await import('@/services/agentContext')
        const primary = await resolvePrimaryAgent(instanceId)
        resolvedAgentId = primary?.id || null
    }
    if (resolvedAgentId) {
        const [row] = await db.select()
            .from(agentIntegrations)
            .where(and(
                eq(agentIntegrations.instanceId, instanceId),
                eq(agentIntegrations.agentId, resolvedAgentId),
                eq(agentIntegrations.integrationType, integrationType)
            ))
        if (!row) return null
        return { config: row.config as Record<string, unknown>, status: row.status }
    }
    // Legacy fallback (no mateh_agent row exists yet)
    const [row] = await db.select()
        .from(agentIntegrations)
        .where(and(
            eq(agentIntegrations.instanceId, instanceId),
            eq(agentIntegrations.agentType, agentType),
            eq(agentIntegrations.integrationType, integrationType)
        ))
    if (!row) return null
    return { config: row.config as Record<string, unknown>, status: row.status }
}

/**
 * Get all integrations for an agent.
 * Phase 2.3.D — agentId-aware (see getAgentIntegration).
 */
export async function getAgentIntegrations(
    instanceId: string,
    agentType: AgentType,
    agentId: string | null | undefined,
): Promise<Array<{ integrationType: string; config: Record<string, unknown>; status: string }>> {
    let resolvedAgentId = agentId || null
    if (!resolvedAgentId) {
        const { resolvePrimaryAgent } = await import('@/services/agentContext')
        const primary = await resolvePrimaryAgent(instanceId)
        resolvedAgentId = primary?.id || null
    }
    const where = resolvedAgentId
        ? and(eq(agentIntegrations.instanceId, instanceId), eq(agentIntegrations.agentId, resolvedAgentId))
        : and(eq(agentIntegrations.instanceId, instanceId), eq(agentIntegrations.agentType, agentType))
    const rows = await db.select().from(agentIntegrations).where(where)
    return rows.map(r => ({
        integrationType: r.integrationType,
        config: r.config as Record<string, unknown>,
        status: r.status,
    }))
}

/**
 * Get all integrations for an instance (all agents). Used by /my-instances
 * to render integration status across multiple agents in one shot.
 */
export async function getAllIntegrations(
    instanceId: string
): Promise<Array<{ agentType: string; agentId: string | null; integrationType: string; config: Record<string, unknown>; status: string }>> {
    const rows = await db.select()
        .from(agentIntegrations)
        .where(eq(agentIntegrations.instanceId, instanceId))
    return rows.map(r => ({
        agentType: r.agentType,
        agentId: r.agentId,
        integrationType: r.integrationType,
        config: r.config as Record<string, unknown>,
        status: r.status,
    }))
}

/**
 * Set (upsert) an integration for an agent.
 *
 * Phase 2.3.D — the unique constraint moved from (instance_id, agent_type,
 * integration_type) to (instance_id, agent_id, integration_type). Pass
 * agentId (mateh_agents.id) to keep multi-MATEH installs isolated. Older
 * callers that don't pass agentId resolve to the primary mateh_agent of
 * the VPS for back-compat.
 */
export async function setAgentIntegration(
    instanceId: string,
    agentType: AgentType,
    integrationType: IntegrationType,
    config: Record<string, unknown>,
    status: string = 'connected',
    agentId: string | null | undefined,
): Promise<void> {
    let resolvedAgentId = agentId || null
    if (!resolvedAgentId) {
        const { resolvePrimaryAgent } = await import('@/services/agentContext')
        const primary = await resolvePrimaryAgent(instanceId)
        resolvedAgentId = primary?.id || null
    }
    await db.insert(agentIntegrations)
        .values({
            instanceId,
            agentId: resolvedAgentId,
            agentType,
            integrationType,
            config: config as any,
            status,
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: [agentIntegrations.instanceId, agentIntegrations.agentId, agentIntegrations.integrationType],
            set: {
                agentType,
                config: config as any,
                status,
                updatedAt: new Date(),
            },
        })
}

/**
 * Remove an integration for an agent. Phase 2.3.D — accepts optional
 * agentId for explicit per-agent removal (multi-MATEH).
 */
export async function removeAgentIntegration(
    instanceId: string,
    agentType: AgentType,
    integrationType: IntegrationType,
    agentId: string | null | undefined,
): Promise<void> {
    let resolvedAgentId = agentId || null
    if (!resolvedAgentId) {
        const { resolvePrimaryAgent } = await import('@/services/agentContext')
        const primary = await resolvePrimaryAgent(instanceId)
        resolvedAgentId = primary?.id || null
    }
    if (resolvedAgentId) {
        await db.delete(agentIntegrations)
            .where(and(
                eq(agentIntegrations.instanceId, instanceId),
                eq(agentIntegrations.agentId, resolvedAgentId),
                eq(agentIntegrations.integrationType, integrationType)
            ))
    } else {
        // Legacy fallback when no agent row exists yet
        await db.delete(agentIntegrations)
            .where(and(
                eq(agentIntegrations.instanceId, instanceId),
                eq(agentIntegrations.agentType, agentType),
                eq(agentIntegrations.integrationType, integrationType)
            ))
    }
}

/**
 * Check if a specific integration exists for an agent
 */
export async function hasAgentIntegration(
    instanceId: string,
    agentType: AgentType,
    integrationType: IntegrationType,
    agentId: string | null | undefined,
): Promise<boolean> {
    const result = await getAgentIntegration(instanceId, agentType, integrationType, agentId)
    return result !== null && result.status === 'connected'
}

/**
 * Determine the "primary" agent type for an instance
 * (used when agentType is not specified — backwards compatibility)
 */
export function getPrimaryAgent(selectedComponents: string[]): AgentType {
    if (selectedComponents.includes('mt')) return 'mt'
    if (selectedComponents.includes('oc')) return 'oc'
    return 'bare'
}