// Marketing Hub controller — single source of truth for the platform's
// marketing-data fabric: intents, integrations, pipelines.
//
// Pure read/write over `instances.researchData` — no business logic. Future
// pipelines and UI talk to these endpoints; relevance computation lives in
// @openclaw/shared/marketing so frontend and backend agree.

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import {
    INTENTS,
    INTEGRATIONS,
    PIPELINES,
    deriveIntents,
    isValidIntent,
    listConnectedIntegrationIds,
    pipelineNamespacesWithData,
    relevanceForIntegrations,
    pipelineStatuses,
    checkPipelineLaunch,
    buildHub,
    getIntegration,
    getPipeline,
    type MarketingIntent,
    type IntegrationConnectionRecord,
    type MarketingResearchData,
    type PipelineId,
} from '@openclaw/shared'
import { setPipelineActivation } from '@/services/pipelineActivation'
import { archiveOrphanedItems, previewOrphanedItems } from '@/services/orphanedItemsCleaner'
import { resolveActiveAgent, readResearchData, writeResearchData } from '@/services/agentContext'

// ─── helper: load + persist researchData with safe merge ─────────────────
async function loadInstance(instanceId: string) {
    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    return instance || null
}

async function patchResearchData(
    c: Context,
    instanceId: string,
    patch: (rd: MarketingResearchData) => MarketingResearchData
): Promise<MarketingResearchData> {
    const agent = await resolveActiveAgent(c, instanceId)
    const rd = (await readResearchData(agent, instanceId)) as unknown as MarketingResearchData
    const next = patch({ ...rd })
    await writeResearchData(agent, instanceId, next as unknown as Record<string, unknown>)
    return next
}

// ─── helper: compute current intents (stored OR auto-derived) ────────────
// Phase 4.1 — auto-derive ALSO consumes rd.answers.platforms + marketingGoals
// (פרופיל עסקי Q9/Q10) so the intents reflect what the user explicitly picked
// in onboarding, even before they touch ניהול שיווק.
function currentIntents(rd: MarketingResearchData, agents: string[]): MarketingIntent[] {
    if (Array.isArray(rd.marketingIntents) && rd.marketingIntents.length > 0) {
        return rd.marketingIntents.filter(isValidIntent)
    }
    const paidProfile = rd.paidProfile as { goal?: string; primaryGoal?: string; launchPath?: string } | undefined
    const normalizedPaid = paidProfile ? { goal: paidProfile.goal || paidProfile.primaryGoal, launchPath: paidProfile.launchPath } : null
    const answers = (rd as unknown as { answers?: { platforms?: string; marketingGoals?: string } }).answers || null
    return deriveIntents({
        agents,
        paidProfile: normalizedPaid,
        existingNamespaces: pipelineNamespacesWithData(rd),
        answers,
    })
}

// ════════════════════════════════════════════════════════════════════════
// GET /hosting/instances/:id/marketing-intents
// Returns current (stored or auto-derived) intents + the catalog for UI.
// ════════════════════════════════════════════════════════════════════════
export const getMarketingIntents = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const inst = await loadInstance(instanceId)
        if (!inst) return fail(c, 'Instance not found', 404)
        const rd = (inst.researchData || {}) as MarketingResearchData
        const agents: string[] = Array.isArray(inst.selectedComponents) ? (inst.selectedComponents as string[]) : []
        const stored = Array.isArray(rd.marketingIntents) ? rd.marketingIntents.filter(isValidIntent) : null
        const derived = currentIntents(rd, agents)
        return ok(c, {
            intents: derived,
            isExplicit: !!stored,                        // user has explicitly set vs auto-derived
            catalog: INTENTS,
        })
    } catch (err) {
        console.error('getMarketingIntents error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/marketing-intents
// Body: { intents: MarketingIntent[] }
// Stores user-set intents (overrides auto-derive). Cleaning up: never deletes
// pipelineState — disabling an intent just hides pipelines, doesn't lose data.
// ════════════════════════════════════════════════════════════════════════
export const saveMarketingIntents = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ intents?: unknown }>()
        if (!Array.isArray(body.intents)) return fail(c, 'intents[] required', 400)
        const cleaned = (body.intents as unknown[]).filter((s): s is MarketingIntent => typeof s === 'string' && isValidIntent(s))
        // Phase 4.1 — reverse sync: mirror intents back to answers.platforms +
        // answers.marketingGoals text so the פרופיל עסקי Q9/Q10 chips reflect
        // current channel selection when user revisits the wizard. Single
        // source of truth: rd.marketingIntents (this write); answers.* is
        // derived display text.
        const { platformsTextFromIntents, goalsTextFromIntents } = await import('@openclaw/shared')
        const platformsText = platformsTextFromIntents(cleaned)
        const goalsText = goalsTextFromIntents(cleaned)
        const next = await patchResearchData(c, instanceId, rd => {
            const ans = ((rd as unknown as { answers?: Record<string, unknown> }).answers as Record<string, unknown>) || {}
            return ({
                ...rd,
                marketingIntents: cleaned,
                // Update display text only when intents derive non-empty values
                // (preserves user's free-text additions when they emptied all chips).
                answers: {
                    ...ans,
                    ...(platformsText ? { platforms: platformsText } : {}),
                    ...(goalsText ? { marketingGoals: goalsText } : {}),
                },
            } as MarketingResearchData)
        })
        // Auto-archive items orphaned by the intent change. E.g. user removes
        // 'content' → all pending blog posts get archived. Frontend should
        // ideally call previewOrphanedItems first to confirm with the user,
        // but we run the archive unconditionally here as the source of truth
        // (intent change is a deliberate action; orphans must not linger).
        const cleanup = await archiveOrphanedItems(instanceId, cleaned).catch(err => {
            console.warn('archiveOrphanedItems failed:', err)
            return { outputsArchived: 0, contentPlanArchived: 0, affectedChannels: [] }
        })
        return ok(c, { intents: next.marketingIntents, cleanup }, 'Intents saved')
    } catch (err) {
        console.error('saveMarketingIntents error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/marketing-intents/preview-cleanup
// Body: { intents: MarketingIntent[] }
// Dry-run — returns counts of items that WOULD be archived if the user
// commits the new intents. Used by the frontend confirm dialog.
// ════════════════════════════════════════════════════════════════════════
export const previewIntentCleanup = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ intents?: unknown }>()
        if (!Array.isArray(body.intents)) return fail(c, 'intents[] required', 400)
        const cleaned = (body.intents as unknown[]).filter((s): s is MarketingIntent => typeof s === 'string' && isValidIntent(s))
        const cleanup = await previewOrphanedItems(instanceId, cleaned)
        return ok(c, cleanup)
    } catch (err) {
        console.error('previewIntentCleanup error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ════════════════════════════════════════════════════════════════════════
// GET /hosting/instances/:id/integration-hub
// Returns the full Hub structure (capability groups → integrations with tier
// + connection state) plus pipeline statuses + pipelineActivation map for
// current intents.
// ════════════════════════════════════════════════════════════════════════
export const getIntegrationHub = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const inst = await loadInstance(instanceId)
        if (!inst) return fail(c, 'Instance not found', 404)
        const rd = (inst.researchData || {}) as MarketingResearchData
        const agents: string[] = Array.isArray(inst.selectedComponents) ? (inst.selectedComponents as string[]) : []
        const intents = currentIntents(rd, agents)
        const connected = listConnectedIntegrationIds(rd)
        const hub = buildHub(intents, connected)
        const pipelineStats = pipelineStatuses(intents, connected)
        const stored = Array.isArray(rd.marketingIntents) ? rd.marketingIntents.filter(isValidIntent) : null
        const pipelineActivation = (rd.pipelineActivation as Record<string, boolean> | undefined) || {}
        return ok(c, {
            intents,
            isExplicitIntents: !!stored,
            connectedIntegrations: connected,
            hub,
            pipelines: pipelineStats,
            pipelineActivation,
        })
    } catch (err) {
        console.error('getIntegrationHub error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/pipelines/:pipelineId/activation
// Body: { enabled: boolean }
// User-controlled on/off switch for a specific pipeline. Persists in
// researchData.pipelineActivation. Cron-driven services check this via
// services/pipelineActivation.ts before running.
// ════════════════════════════════════════════════════════════════════════
export const setPipelineActivationEndpoint = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const pipelineId = c.req.param('pipelineId') as PipelineId
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const pipeline = getPipeline(pipelineId)
        if (!pipeline) return fail(c, 'Unknown pipeline: ' + pipelineId, 400)
        const raw = await c.req.json<{ enabled?: boolean }>()
        const body = raw as { enabled?: boolean }
        if (typeof body.enabled !== 'boolean') return fail(c, 'enabled (boolean) required', 400)
        await setPipelineActivation(instanceId, pipelineId, body.enabled)
        return ok(c, { pipelineId, enabled: body.enabled }, 'Activation saved')
    } catch (err) {
        console.error('setPipelineActivationEndpoint error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/integrations/:integrationId/state
// Body: { connected: boolean, accountInfo?: object, scopes?: string[] }
// Records integration connection status. Idempotent. Called by frontend
// whenever user saves credentials or disconnects (mirrors localStorage flag).
// ════════════════════════════════════════════════════════════════════════
export const setIntegrationState = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const integrationId = c.req.param('integrationId')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const integration = getIntegration(integrationId)
        if (!integration) return fail(c, 'Unknown integration: ' + integrationId, 400)
        const raw = await c.req.json<{ connected?: boolean; accountInfo?: Record<string, unknown>; scopes?: string[] }>()
        const body = raw as { connected?: boolean; accountInfo?: Record<string, unknown>; scopes?: string[] }
        if (typeof body.connected !== 'boolean') return fail(c, 'connected (boolean) required', 400)
        const connected: boolean = body.connected

        const now = new Date().toISOString()
        const next = await patchResearchData(c, instanceId, rd => {
            const state = { ...(rd.integrationsState || {}) }
            const prev = state[integrationId]
            const record: IntegrationConnectionRecord = {
                ...(prev || {}),
                connected,
                connectedAt: connected ? (prev?.connectedAt || now) : prev?.connectedAt,
                disconnectedAt: !connected ? now : undefined,
                scopes: Array.isArray(body.scopes) ? body.scopes : prev?.scopes,
                accountInfo: body.accountInfo || prev?.accountInfo,
                usedBy: prev?.usedBy || [],
            }
            state[integrationId] = record
            return { ...rd, integrationsState: state }
        })
        return ok(c, { integration: integrationId, state: next.integrationsState?.[integrationId] }, 'State saved')
    } catch (err) {
        console.error('setIntegrationState error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/integrations/sync
// Body: { connected: string[] }
// Bulk-sync from frontend localStorage on dashboard load. Used to reconcile
// the per-instance cf_*_saved flags with backend integrationsState. Marks
// missing integrations as disconnected (so user clearing localStorage works).
// ════════════════════════════════════════════════════════════════════════
export const syncIntegrationStates = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ connected?: unknown }>()
        if (!Array.isArray(body.connected)) return fail(c, 'connected[] required', 400)
        const claimedIds = (body.connected as unknown[]).filter((s): s is string => typeof s === 'string')
        const validIds = claimedIds.filter(id => !!getIntegration(id))

        const now = new Date().toISOString()
        const next = await patchResearchData(c, instanceId, rd => {
            const state = { ...(rd.integrationsState || {}) }
            const claimedSet = new Set(validIds)
            for (const id of validIds) {
                const prev = state[id]
                state[id] = {
                    ...(prev || {}),
                    connected: true,
                    connectedAt: prev?.connectedAt || now,
                    scopes: prev?.scopes,
                    accountInfo: prev?.accountInfo,
                    usedBy: prev?.usedBy || [],
                }
            }
            // Mark anything previously connected but not in current claim as disconnected.
            for (const [id, prev] of Object.entries(state)) {
                if (prev?.connected && !claimedSet.has(id)) {
                    state[id] = { ...prev, connected: false, disconnectedAt: now }
                }
            }
            return { ...rd, integrationsState: state }
        })
        return ok(c, { connected: listConnectedIntegrationIds(next) })
    } catch (err) {
        console.error('syncIntegrationStates error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ════════════════════════════════════════════════════════════════════════
// GET /hosting/instances/:id/pipelines/:pipelineId/precheck
// Returns canLaunch + warnings + qualityScore for a pipeline. Used by UI
// to show soft warnings before "Run research" / "Run audit" / etc.
// ════════════════════════════════════════════════════════════════════════
export const pipelinePrecheck = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const pipelineId = c.req.param('pipelineId')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const pipeline = getPipeline(pipelineId as never)
        if (!pipeline) return fail(c, 'Unknown pipeline: ' + pipelineId, 400)
        const inst = await loadInstance(instanceId)
        if (!inst) return fail(c, 'Instance not found', 404)
        const rd = (inst.researchData || {}) as MarketingResearchData
        const agents: string[] = Array.isArray(inst.selectedComponents) ? (inst.selectedComponents as string[]) : []
        const intents = currentIntents(rd, agents)
        const connected = listConnectedIntegrationIds(rd)
        const check = checkPipelineLaunch(pipelineId, intents, connected)
        if (!check) return fail(c, 'Could not compute precheck', 500)
        return ok(c, { pipelineId, ...check })
    } catch (err) {
        console.error('pipelinePrecheck error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ════════════════════════════════════════════════════════════════════════
// GET /hosting/marketing/catalog
// Static registries — no auth needed. Useful for frontend bundle pre-load
// and for admin tooling to inspect what the platform knows about.
// ════════════════════════════════════════════════════════════════════════
export const getMarketingCatalog = async (c: Context) => {
    try {
        return ok(c, {
            intents: INTENTS,
            integrations: INTEGRATIONS,
            pipelines: PIPELINES.map(p => ({
                id: p.id,
                nameHe: p.nameHe,
                nameEn: p.nameEn,
                descHe: p.descHe,
                intents: p.intents,
                requires: p.requires,
                improvesWith: p.improvesWith,
                upstreamPipelines: p.upstreamPipelines || [],
                runMode: p.runMode,
            })),
        })
    } catch (err) {
        console.error('getMarketingCatalog error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/integration-hub/relevance
// Body: { intents?: MarketingIntent[] }
// PREVIEW endpoint — given hypothetical intents (e.g. user toggling SEO on),
// returns Hub structure as it WOULD look. Doesn't persist anything.
// Used by the inline intent picker for live preview.
// ════════════════════════════════════════════════════════════════════════
export const previewHubForIntents = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const raw = await c.req.json<{ intents?: unknown }>().catch(() => ({} as { intents?: unknown }))
        const body = raw as { intents?: unknown }
        const cleaned = Array.isArray(body.intents)
            ? (body.intents as unknown[]).filter((s): s is MarketingIntent => typeof s === 'string' && isValidIntent(s))
            : []
        const inst = await loadInstance(instanceId)
        if (!inst) return fail(c, 'Instance not found', 404)
        const rd = (inst.researchData || {}) as MarketingResearchData
        const connected = listConnectedIntegrationIds(rd)
        const hub = buildHub(cleaned, connected)
        const pipelineStats = pipelineStatuses(cleaned, connected)
        const relevance = relevanceForIntegrations(cleaned)
        return ok(c, { intents: cleaned, hub, pipelines: pipelineStats, relevance })
    } catch (err) {
        console.error('previewHubForIntents error:', err)
        return fail(c, (err as Error).message, 500)
    }
}