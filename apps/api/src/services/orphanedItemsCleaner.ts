// Auto-archive items orphaned by an intent change.
//
// Triggered when a user disables an intent (e.g. removes 'content' from their
// marketing intents in 'ניהול שיווק' tab). Walks two stores:
//   1. agentOutputs table — pending_review / draft items
//   2. researchData.contentPlan jsonb array — planned / drafting items
// Items whose channel maps to a now-disabled intent are flipped to 'archived'.
//
// This prevents stale items (auto-generated before the intent change) from
// cluttering the approval queue and content calendar.

import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { instances, agentOutputs } from '@/db/schema'
import type { MarketingIntent } from '@openclaw/shared'

// Channel → intent mapping. A channel/type belongs to ONE primary intent.
// If that intent is disabled, items in this channel are archived.
const CHANNEL_TO_INTENT: Record<string, MarketingIntent> = {
    // Organic social
    instagram:    'social_organic',
    facebook:     'social_organic',
    linkedin:     'social_organic',
    twitter:      'social_organic',
    x:            'social_organic',
    threads:      'social_organic',
    tiktok:       'social_organic',
    youtube:      'social_organic',
    // Content
    blog:         'content',
    article:      'content',
    content:      'content',
    // Paid social
    meta_ad:      'paid_social',
    ig_ad:        'paid_social',
    fb_ad:        'paid_social',
    tiktok_ad:    'paid_social',
    linkedin_ad:  'paid_social',
    // Paid search
    google_ad:    'paid_search',
    google_ads:   'paid_search',
    sem:          'paid_search',
    // Email
    newsletter:   'email_marketing',
    email:        'email_marketing',
    // Comms (always allowed regardless of intent)
    telegram:     'social_organic',     // when used as content channel
    whatsapp:     'social_organic',
}

function _normalizeChannel(s: string): string {
    return (s || '').toLowerCase().trim().replace(/[\s-]/g, '_')
}

// Items active states that we'll flip to archived. We never touch published/
// already-archived items.
const ACTIVE_OUTPUT_STATES = ['pending_review', 'draft']
const ACTIVE_PLAN_STATES = ['planned', 'drafting', 'draft', 'pending_review']

export interface CleanupResult {
    outputsArchived: number
    contentPlanArchived: number
    affectedChannels: string[]
}

// Preview only — count what WOULD be archived without changing anything.
// Used by the frontend confirm dialog before user commits intent change.
export async function previewOrphanedItems(
    instanceId: string,
    nextIntents: MarketingIntent[],
    agentId?: string | null,
): Promise<CleanupResult> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { outputsArchived: 0, contentPlanArchived: 0, affectedChannels: [] }

    // Per-agent: scope to the active agent's content plan + outputs.
    const { resolveAgentById, resolvePrimaryAgent, readResearchData } = await import('@/services/agentContext')
    const __agent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)

    const activeIntentSet = new Set(nextIntents)
    const affectedChannels = new Set<string>()

    // Outputs
    const outs = await db.select({ id: agentOutputs.id, platform: agentOutputs.platform, outputType: agentOutputs.outputType, status: agentOutputs.status })
        .from(agentOutputs)
        .where(and(
            eq(agentOutputs.instanceId, instanceId),
            __agent?.id ? eq(agentOutputs.agentId, __agent.id) : undefined,
            inArray(agentOutputs.status, ACTIVE_OUTPUT_STATES),
        ))
    let outputsArchived = 0
    for (const o of outs) {
        const ch = _normalizeChannel(o.platform || o.outputType || '')
        const intent = CHANNEL_TO_INTENT[ch]
        if (intent && !activeIntentSet.has(intent)) {
            outputsArchived++
            affectedChannels.add(ch)
        }
    }

    // Content plan items in researchData jsonb (active agent)
    const rd = ((await readResearchData(__agent, instanceId)) as Record<string, unknown> | null) || {}
    const plan = Array.isArray(rd.contentPlan) ? (rd.contentPlan as Array<Record<string, unknown>>) : []
    let contentPlanArchived = 0
    for (const it of plan) {
        const status = String(it.status || '')
        if (!ACTIVE_PLAN_STATES.includes(status)) continue
        const ch = _normalizeChannel(String(it.channel || it.type || ''))
        const intent = CHANNEL_TO_INTENT[ch]
        if (intent && !activeIntentSet.has(intent)) {
            contentPlanArchived++
            affectedChannels.add(ch)
        }
    }

    return { outputsArchived, contentPlanArchived, affectedChannels: Array.from(affectedChannels) }
}

// Execute archive — flip statuses to 'archived'. Idempotent.
export async function archiveOrphanedItems(
    instanceId: string,
    nextIntents: MarketingIntent[],
    agentId?: string | null,
): Promise<CleanupResult> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { outputsArchived: 0, contentPlanArchived: 0, affectedChannels: [] }

    // Per-agent: content plan + agent outputs are agent-scoped. Resolve the
    // active agent, read its research_data, and scope outputs to it (a raw
    // instance read/write hit the primary mirror only).
    const { resolveAgentById, resolvePrimaryAgent, readResearchData, writeResearchData } = await import('@/services/agentContext')
    const __agent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)
    const rdAgent = ((await readResearchData(__agent, instanceId)) as Record<string, unknown> | null) || {}

    const activeIntentSet = new Set(nextIntents)
    const affectedChannels = new Set<string>()

    // Step 1: agentOutputs
    const outs = await db.select({ id: agentOutputs.id, platform: agentOutputs.platform, outputType: agentOutputs.outputType })
        .from(agentOutputs)
        .where(and(
            eq(agentOutputs.instanceId, instanceId),
            __agent?.id ? eq(agentOutputs.agentId, __agent.id) : undefined,
            inArray(agentOutputs.status, ACTIVE_OUTPUT_STATES),
        ))
    const orphanedOutputIds: string[] = []
    for (const o of outs) {
        const ch = _normalizeChannel(o.platform || o.outputType || '')
        const intent = CHANNEL_TO_INTENT[ch]
        if (intent && !activeIntentSet.has(intent)) {
            orphanedOutputIds.push(o.id)
            affectedChannels.add(ch)
        }
    }
    if (orphanedOutputIds.length > 0) {
        await db.update(agentOutputs)
            .set({ status: 'archived' })
            .where(inArray(agentOutputs.id, orphanedOutputIds))
    }

    // Step 2: researchData.contentPlan
    const rd = rdAgent
    const plan = Array.isArray(rd.contentPlan) ? (rd.contentPlan as Array<Record<string, unknown>>) : []
    let contentPlanArchived = 0
    let planMutated = false
    const nextPlan = plan.map(it => {
        const status = String(it.status || '')
        if (!ACTIVE_PLAN_STATES.includes(status)) return it
        const ch = _normalizeChannel(String(it.channel || it.type || ''))
        const intent = CHANNEL_TO_INTENT[ch]
        if (intent && !activeIntentSet.has(intent)) {
            contentPlanArchived++
            affectedChannels.add(ch)
            planMutated = true
            return { ...it, status: 'archived', archivedAt: new Date().toISOString(), archivedReason: 'intent_disabled' }
        }
        return it
    })
    if (planMutated) {
        await writeResearchData(__agent, instanceId, { ...rd, contentPlan: nextPlan } as never)
    }

    return {
        outputsArchived: orphanedOutputIds.length,
        contentPlanArchived,
        affectedChannels: Array.from(affectedChannels),
    }
}