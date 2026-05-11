/**
 * Agent Integration Routes
 *
 * New per-agent integration endpoints:
 *   GET  /instances/:id/agents/:agentType/integrations
 *   GET  /instances/:id/agents/:agentType/integrations/:type
 *   POST /instances/:id/agents/:agentType/integrations/:type
 *   DELETE /instances/:id/agents/:agentType/integrations/:type
 *
 * These read/write from agent_integrations table (per-agent).
 * Legacy endpoints on instances table still work for backwards compatibility.
 */

import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import {
    getAgentIntegrations,
    getAgentIntegration,
    setAgentIntegration,
    removeAgentIntegration,
    type AgentType,
    type IntegrationType
} from '@/services/agentIntegrations'

const VALID_AGENT_TYPES = ['oc', 'mt', 'bare']
const VALID_INTEGRATION_TYPES = [
    'telegram', 'google', 'meta', 'microsoft',
    'whatsapp', 'gbp', 'api_key', 'brave', 'smtp', 'wordpress',
    // Phase 2.3.K(fix5) — newly persisted to agent_integrations
    'resend', 'replicate', 'brightdata', 'gemini', 'canva',
    'gsc', 'dataforseo', 'firecrawl', 'reddit',
]

function validateAgentType(agentType: string): agentType is AgentType {
    return VALID_AGENT_TYPES.includes(agentType)
}

function validateIntegrationType(type: string): type is IntegrationType {
    return VALID_INTEGRATION_TYPES.includes(type)
}

/**
 * GET /instances/:id/agents/:agentType/integrations
 * Returns all integrations for a specific agent
 */
export const listAgentIntegrations = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const agentType = c.req.param('agentType')

        if (!validateAgentType(agentType)) {
            return fail(c, `Invalid agent type: ${agentType}`, 400)
        }

        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) {
            return fail(c, 'Instance not found', 404)
        }

        // Phase 2.3.E — honor ?agentId= for per-agent isolation
        const { resolveActiveAgent } = await import('@/services/agentContext')
        const __activeAgent = await resolveActiveAgent(c, instanceId)
        const integrations = await getAgentIntegrations(instanceId, agentType, __activeAgent?.id)

        // Build a summary object like the legacy format
        const summary: Record<string, { connected: boolean; status: string; [key: string]: unknown }> = {}
        for (const int of integrations) {
            summary[int.integrationType] = {
                connected: int.status === 'connected',
                status: int.status,
                ...(int.integrationType === 'telegram' ? {
                    hasBotToken: !!int.config.botToken,
                    hasChatId: !!int.config.chatId,
                } : {}),
                ...(int.integrationType === 'google' ? {
                    email: int.config.email,
                    scopes: int.config.scopes,
                } : {}),
                ...(int.integrationType === 'meta' ? {
                    pageName: int.config.pageName,
                    hasInstagram: !!int.config.instagramAccountId,
                    hasAdAccount: !!int.config.adAccountId,
                } : {}),
                ...(int.integrationType === 'microsoft' ? {
                    email: int.config.email,
                    displayName: int.config.displayName,
                    scopes: int.config.scopes,
                } : {}),
                ...(int.integrationType === 'api_key' ? {
                    provider: int.config.provider,
                    hasAnthropic: !!int.config.hasAnthropic,
                    hasOpenai: !!int.config.hasOpenai,
                } : {}),
            }
        }

        return ok(c, {
            agentType,
            integrations: summary,
        }, 'Agent integrations')
    } catch (err) {
        console.error('listAgentIntegrations error:', err)
        return fail(c, 'Failed to get agent integrations', 500)
    }
}

/**
 * GET /instances/:id/agents/:agentType/integrations/:type
 * Get a specific integration for an agent
 */
export const getAgentIntegrationEndpoint = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const agentType = c.req.param('agentType')
        const intType = c.req.param('type')

        if (!validateAgentType(agentType)) return fail(c, `Invalid agent type`, 400)
        if (!validateIntegrationType(intType)) return fail(c, `Invalid integration type`, 400)

        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        // Phase 2.3.E — honor ?agentId= for per-agent isolation
        const { resolveActiveAgent } = await import('@/services/agentContext')
        const __activeAgent = await resolveActiveAgent(c, instanceId)
        const integration = await getAgentIntegration(instanceId, agentType, intType, __activeAgent?.id)
        if (!integration) {
            return ok(c, { connected: false, agentType, integrationType: intType }, 'Not connected')
        }

        return ok(c, {
            connected: integration.status === 'connected',
            status: integration.status,
            agentType,
            integrationType: intType,
            // Return safe config (strip sensitive fields)
            ...(intType === 'telegram' ? { hasBotToken: !!integration.config.botToken } : {}),
            ...(intType === 'google' ? { email: integration.config.email, scopes: integration.config.scopes } : {}),
            ...(intType === 'meta' ? { pageName: integration.config.pageName } : {}),
            ...(intType === 'microsoft' ? { email: integration.config.email } : {}),
        }, 'Integration details')
    } catch (err) {
        console.error('getAgentIntegration error:', err)
        return fail(c, 'Failed to get integration', 500)
    }
}

/**
 * POST /instances/:id/agents/:agentType/integrations/:type
 * Connect/update an integration for a specific agent.
 *
 * Phase 2.3.E — when ?agentId= is provided in query, use it as the
 * mateh_agents.id for the upsert (multi-MATEH isolation). Otherwise
 * the helper resolves to the primary agent for back-compat.
 */
export const setAgentIntegrationEndpoint = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const agentType = c.req.param('agentType')
        const intType = c.req.param('type')

        if (!validateAgentType(agentType)) return fail(c, `Invalid agent type`, 400)
        if (!validateIntegrationType(intType)) return fail(c, `Invalid integration type`, 400)

        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const body = await c.req.json()

        const { resolveActiveAgent } = await import('@/services/agentContext')
        const __activeAgent = await resolveActiveAgent(c, instanceId)

        await setAgentIntegration(
            instanceId,
            agentType,
            intType,
            body.config || body,
            body.status || 'connected',
            __activeAgent?.id,
        )

        return ok(c, { agentType, integrationType: intType, status: 'connected' }, 'Integration saved')
    } catch (err) {
        console.error('setAgentIntegration error:', err)
        return fail(c, 'Failed to save integration', 500)
    }
}

/**
 * DELETE /instances/:id/agents/:agentType/integrations/:type
 * Disconnect an integration for a specific agent.
 * Phase 2.3.E — agentId-aware (see set endpoint above).
 */
export const deleteAgentIntegrationEndpoint = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const agentType = c.req.param('agentType')
        const intType = c.req.param('type')

        if (!validateAgentType(agentType)) return fail(c, `Invalid agent type`, 400)
        if (!validateIntegrationType(intType)) return fail(c, `Invalid integration type`, 400)

        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const { resolveActiveAgent } = await import('@/services/agentContext')
        const __activeAgent = await resolveActiveAgent(c, instanceId)

        await removeAgentIntegration(instanceId, agentType, intType, __activeAgent?.id)

        return ok(c, { agentType, integrationType: intType }, 'Integration disconnected')
    } catch (err) {
        console.error('deleteAgentIntegration error:', err)
        return fail(c, 'Failed to disconnect integration', 500)
    }
}