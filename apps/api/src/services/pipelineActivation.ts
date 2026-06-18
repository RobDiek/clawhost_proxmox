// Pipeline activation service — single source of truth for whether a given
// pipeline is enabled for a tenant.
//
// Activation map lives at researchData.pipelineActivation: { [pipelineId]: boolean }
// User controls it via the 'ניהול שיווק' tab. Cron-driven services
// (planDraftRunner, contentPlanMetrics, autoOptimization, weeklyReport, etc.)
// MUST call isPipelineEnabled() before doing work for a tenant.
//
// Default behavior (no explicit value):
//   - intent-relevant + all required integrations connected → ENABLED
//   - otherwise → DISABLED
// This matches the frontend's `isPipelineActiveDefault` logic so server and
// client agree without coordination.

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import {
    PIPELINES,
    deriveIntents,
    listConnectedIntegrationIds,
    pipelineNamespacesWithData,
    type MarketingIntent,
    type MarketingResearchData,
    type PipelineId,
    type PipelineDef,
} from '@openclaw/shared'

// Resolve "a|b|c" requirement against connected set
function _resolveReq(req: string, connected: Set<string>): boolean {
    if (req.includes('|')) return req.split('|').some(r => connected.has(r.trim()))
    return connected.has(req)
}

function _defaultActiveFor(
    pipeline: PipelineDef,
    intents: MarketingIntent[],
    connected: string[]
): boolean {
    const intentMatch = pipeline.intents.some(i => intents.includes(i))
    if (!intentMatch) return false
    const connectedSet = new Set(connected)
    return pipeline.requires.every(req => _resolveReq(req, connectedSet))
}

// Resolve current intents for a tenant (explicit OR auto-derive)
function _intentsFor(rd: MarketingResearchData, agents: string[]): MarketingIntent[] {
    if (Array.isArray(rd.marketingIntents) && rd.marketingIntents.length > 0) {
        return rd.marketingIntents
    }
    const paidProfile = rd.paidProfile as { goal?: string; primaryGoal?: string; launchPath?: string } | undefined
    return deriveIntents({
        agents,
        paidProfile: paidProfile ? { goal: paidProfile.goal || paidProfile.primaryGoal, launchPath: paidProfile.launchPath } : null,
        existingNamespaces: pipelineNamespacesWithData(rd),
    })
}

// Main check — call this before running any pipeline-bound work.
// Pass `agent` to evaluate against that agent's OWN research_data (per-agent
// gate on a multi-agent VPS); omit it for the legacy instance-level check.
export async function isPipelineEnabled(
    instanceId: string,
    pipelineId: PipelineId,
    agent?: { researchData?: unknown } | null,
): Promise<boolean> {
    let rd: MarketingResearchData
    let agents: string[]
    if (agent) {
        rd = (agent.researchData || {}) as MarketingResearchData
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        agents = inst && Array.isArray(inst.selectedComponents) ? (inst.selectedComponents as string[]) : []
    } else {
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!inst) return false
        rd = (inst.researchData || {}) as MarketingResearchData
        agents = Array.isArray(inst.selectedComponents) ? (inst.selectedComponents as string[]) : []
    }

    const activation = rd.pipelineActivation as Record<string, boolean> | undefined
    if (activation && typeof activation[pipelineId] === 'boolean') {
        return activation[pipelineId]
    }

    // No explicit override — derive default
    const pipeline = PIPELINES.find(p => p.id === pipelineId)
    if (!pipeline) return false

    const intents = _intentsFor(rd, agents)
    const connected = listConnectedIntegrationIds(rd)
    return _defaultActiveFor(pipeline, intents, connected)
}

// Bulk variant — useful for cron sweeps that need to filter many tenants
export async function getEnabledPipelinesForInstance(
    instanceId: string
): Promise<PipelineId[]> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return []
    const rd = (inst.researchData || {}) as MarketingResearchData
    const activation = (rd.pipelineActivation as Record<string, boolean> | undefined) || {}
    const agents: string[] = Array.isArray(inst.selectedComponents) ? (inst.selectedComponents as string[]) : []
    const intents = _intentsFor(rd, agents)
    const connected = listConnectedIntegrationIds(rd)
    return PIPELINES
        .filter(p => {
            if (typeof activation[p.id] === 'boolean') return activation[p.id]
            return _defaultActiveFor(p, intents, connected)
        })
        .map(p => p.id)
}

// Setter — called by /pipelines/:id/activation endpoint
export async function setPipelineActivation(
    instanceId: string,
    pipelineId: PipelineId,
    enabled: boolean,
    agentId?: string | null,
): Promise<void> {
    // Per-agent: pipeline activation is per-agent state. Resolve the active
    // agent and persist via mutateResearchData (a raw db.update(instances)
    // wrote the primary mirror AND got clobbered by the next agentContext write).
    const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } = await import('@/services/agentContext')
    const agent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)
    await mutateResearchData(agent, instanceId, (rd: any) => ({
        ...rd,
        pipelineActivation: {
            ...((rd?.pipelineActivation as Record<string, boolean>) || {}),
            [pipelineId]: enabled,
        },
    }))
}