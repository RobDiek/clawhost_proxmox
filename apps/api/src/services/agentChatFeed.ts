/**
 * Agent chat feed — mirror of EVERY platform message sent to a tenant's Telegram
 * bot, so the in-app "צ'אט עם סוכן" tab shows exactly the same stream as Telegram.
 *
 * Single source of truth: every per-tenant Telegram send point calls
 * recordAgentChatFeed() right after sending, so the two surfaces stay identical
 * (this is the implementation behind the "מסונכרן עם Telegram" banner). Stored
 * per-agent in research_data.agentChatFeed[] (capped) via mutateResearchData —
 * systemic per-client, no schema migration. NOTE: this mirrors the PLATFORM →
 * Telegram stream; it does not merge OpenClaw's own user↔agent web conversation.
 */
import { randomBytes } from 'crypto'

export interface AgentChatFeedItem {
    id: string
    at: string
    direction: 'out' | 'in'   // out = platform→user; in = user reply (future)
    kind: string              // 'approval' | 'notification' | 'report' | 'plan' | 'agent'
    text: string
    outputId?: string         // link back to the agent_output when applicable
}

const CAP = 120

/**
 * Append a message to the tenant's agent chat feed. Best-effort: never throws
 * into the caller (a feed write must not break the Telegram send path).
 */
export async function recordAgentChatFeed(
    instanceId: string,
    agentId: string | null | undefined,
    text: string,
    opts: { kind?: string; direction?: 'out' | 'in'; outputId?: string } = {},
): Promise<void> {
    try {
        const clean = String(text || '').trim()
        if (!instanceId || !clean) return
        const { resolvePrimaryAgent, resolveAgentById, mutateResearchData } = await import('./agentContext')
        const agent = agentId ? await resolveAgentById(instanceId, agentId) : await resolvePrimaryAgent(instanceId)
        const item: AgentChatFeedItem = {
            id: 'feed_' + randomBytes(5).toString('hex'),
            at: new Date().toISOString(),
            direction: opts.direction || 'out',
            kind: opts.kind || 'notification',
            text: clean.slice(0, 4000),
            outputId: opts.outputId,
        }
        await mutateResearchData(agent, instanceId, (rd: any) => {
            const feed: AgentChatFeedItem[] = Array.isArray(rd.agentChatFeed) ? rd.agentChatFeed : []
            // De-dupe an identical consecutive message (edits re-send the same text).
            const last = feed[feed.length - 1]
            if (last && last.text === item.text && last.direction === item.direction) {
                last.at = item.at
                if (item.outputId) last.outputId = item.outputId
            } else {
                feed.push(item)
            }
            rd.agentChatFeed = feed.slice(-CAP)
            return rd
        })
    } catch (err) {
        console.warn('[agentChatFeed] record failed:', (err as Error).message)
    }
}

/** Read the tenant's agent chat feed (chronological). */
export async function getAgentChatFeed(
    instanceId: string,
    agentId: string | null | undefined,
): Promise<AgentChatFeedItem[]> {
    try {
        const { resolvePrimaryAgent, resolveAgentById, readResearchData } = await import('./agentContext')
        const agent = agentId ? await resolveAgentById(instanceId, agentId) : await resolvePrimaryAgent(instanceId)
        const rd: any = (await readResearchData(agent, instanceId)) || {}
        return Array.isArray(rd.agentChatFeed) ? rd.agentChatFeed : []
    } catch {
        return []
    }
}