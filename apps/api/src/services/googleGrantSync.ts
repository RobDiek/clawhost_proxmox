/**
 * Google grant sync — true per-agent isolation for a SHARED Google identity.
 *
 * Problem (proven 2026-06-15): per-agent token STORAGE is isolated (each agent
 * has its own mateh_agents.googleTokens + agent_integrations row), but the
 * Google GRANT is not — Google issues refresh tokens per (user, OAuth-client).
 * When agent B re-consents the SAME email, Google mints a fresh token and
 * REVOKES agent A's prior token (observed: connecting GA on Moving Station
 * revoked Packing Station's token → invalid_grant). So two agents sharing one
 * email cannibalize each other.
 *
 * Fix (paired with include_granted_scopes in the OAuth start):
 *   - On connect, the new token carries the UNION of all scopes this user ever
 *     granted this client (include_granted_scopes). We then MIRROR that fresh,
 *     full-scope token onto every sibling agent that uses the SAME email — so
 *     no sibling is left holding the just-revoked token. One Google grant, kept
 *     in sync across all agents that reference it.
 *   - Resource SELECTIONS stay per-agent (GTM container, GA4 property, Ads
 *     account, GSC site) — never touched here. Same container can be chosen by
 *     two agents independently.
 *   - On disconnect, only hit Google's revoke endpoint when this is the LAST
 *     agent using the email; otherwise just drop this agent's link.
 *
 * Scope: same instance (covers the agency master with multiple agents). Email
 * match is case-insensitive.
 */

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents, agentIntegrations } from '@/db/schema'

function sameEmail(a: unknown, b: unknown): boolean {
    return !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
}

/**
 * After an OAuth connect for `email`, push the fresh full-scope `googleTokens`
 * onto every OTHER agent on the instance that uses the same email, so the
 * just-revoked prior token doesn't leave them dead. Returns the count synced.
 */
export async function propagateGoogleGrant(args: {
    instanceId: string
    sourceAgentId: string | null | undefined
    email: string
    googleTokens: Record<string, unknown>
}): Promise<number> {
    const { instanceId, sourceAgentId, email, googleTokens } = args
    if (!email) return 0

    const siblings = await db.select().from(matehAgents).where(eq(matehAgents.vpsInstanceId, instanceId)) as Array<Record<string, unknown>>
    let synced = 0
    for (const a of siblings) {
        if (a.id === sourceAgentId) continue
        const aTok = a.googleTokens as { email?: string } | null
        if (!sameEmail(aTok?.email, email)) continue

        // Mirror the canonical token (the grant) onto this sibling. Selections
        // (googleAdsConfig, research_data.mazhirGtm.target, etc.) are NOT touched.
        await db.update(matehAgents)
            .set({ googleTokens: googleTokens as never, updatedAt: new Date() })
            .where(eq(matehAgents.id, a.id as string))

        // Keep the per-agent integration row's token config fresh too (cards +
        // token readers that go through agent_integrations). Update-only: don't
        // create a google row for an agent that never connected it.
        await db.update(agentIntegrations)
            .set({ config: googleTokens as never, status: 'connected', updatedAt: new Date() })
            .where(and(
                eq(agentIntegrations.instanceId, instanceId),
                eq(agentIntegrations.agentId, a.id as string),
                eq(agentIntegrations.integrationType, 'google'),
            ))
        synced++
    }
    if (synced > 0) {
        console.log(`[googleGrantSync] propagated fresh grant for ${email} to ${synced} sibling agent(s) on ${instanceId}`)
    }
    return synced
}

/**
 * True if any OTHER agent on the instance still uses `email` for Google — used
 * by disconnect to decide whether hitting Google's revoke endpoint is safe
 * (revoke kills the shared grant for ALL siblings).
 */
export async function googleEmailStillInUse(args: {
    instanceId: string
    excludeAgentId: string | null | undefined
    email: string
}): Promise<boolean> {
    const { instanceId, excludeAgentId, email } = args
    if (!email) return false
    const siblings = await db.select().from(matehAgents).where(eq(matehAgents.vpsInstanceId, instanceId)) as Array<Record<string, unknown>>
    return siblings.some(a => {
        if (a.id === excludeAgentId) return false
        const aTok = a.googleTokens as { email?: string; refreshToken?: string } | null
        return sameEmail(aTok?.email, email) && !!aTok?.refreshToken
    })
}