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
export type IntegrationType = 'telegram' | 'google' | 'meta' | 'microsoft' | 'whatsapp' | 'gbp' | 'api_key' | 'brave' | 'smtp' | 'wordpress' | 'gsc' | 'dataforseo' | 'firecrawl' | 'reddit'

/**
 * Get a specific integration for an agent
 */
export async function getAgentIntegration(
    instanceId: string,
    agentType: AgentType,
    integrationType: IntegrationType
): Promise<{ config: Record<string, unknown>; status: string } | null> {
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
 * Get all integrations for an agent
 */
export async function getAgentIntegrations(
    instanceId: string,
    agentType: AgentType
): Promise<Array<{ integrationType: string; config: Record<string, unknown>; status: string }>> {
    const rows = await db.select()
        .from(agentIntegrations)
        .where(and(
            eq(agentIntegrations.instanceId, instanceId),
            eq(agentIntegrations.agentType, agentType)
        ))
    return rows.map(r => ({
        integrationType: r.integrationType,
        config: r.config as Record<string, unknown>,
        status: r.status,
    }))
}

/**
 * Get all integrations for an instance (all agents)
 */
export async function getAllIntegrations(
    instanceId: string
): Promise<Array<{ agentType: string; integrationType: string; config: Record<string, unknown>; status: string }>> {
    const rows = await db.select()
        .from(agentIntegrations)
        .where(eq(agentIntegrations.instanceId, instanceId))
    return rows.map(r => ({
        agentType: r.agentType,
        integrationType: r.integrationType,
        config: r.config as Record<string, unknown>,
        status: r.status,
    }))
}

/**
 * Set (upsert) an integration for an agent
 */
export async function setAgentIntegration(
    instanceId: string,
    agentType: AgentType,
    integrationType: IntegrationType,
    config: Record<string, unknown>,
    status: string = 'connected'
): Promise<void> {
    await db.insert(agentIntegrations)
        .values({
            instanceId,
            agentType,
            integrationType,
            config: config as any,
            status,
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: [agentIntegrations.instanceId, agentIntegrations.agentType, agentIntegrations.integrationType],
            set: {
                config: config as any,
                status,
                updatedAt: new Date(),
            },
        })
}

/**
 * Remove an integration for an agent
 */
export async function removeAgentIntegration(
    instanceId: string,
    agentType: AgentType,
    integrationType: IntegrationType
): Promise<void> {
    await db.delete(agentIntegrations)
        .where(and(
            eq(agentIntegrations.instanceId, instanceId),
            eq(agentIntegrations.agentType, agentType),
            eq(agentIntegrations.integrationType, integrationType)
        ))
}

/**
 * Check if a specific integration exists for an agent
 */
export async function hasAgentIntegration(
    instanceId: string,
    agentType: AgentType,
    integrationType: IntegrationType
): Promise<boolean> {
    const result = await getAgentIntegration(instanceId, agentType, integrationType)
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