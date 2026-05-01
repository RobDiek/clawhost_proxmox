import type { SubscriptionWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { agentStatus } from '@openclaw/shared'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { subscriptionStatus } from '@openclaw/shared'
import { cleanupAgent } from '@/controllers/agents/helpers'
import { getProvider } from '@/services/provider'

const onSubscriptionRevoked = async (data: SubscriptionWebhookData) => {
    const agent = await db
        .select({
            id: agents.id,
            providerServerId: agents.providerServerId,
            subdomain: agents.subdomain,
            ip: agents.ip,
            deletionScheduledAt: agents.deletionScheduledAt
        })
        .from(agents)
        .where(eq(agents.polarSubscriptionId, data.id))
        .limit(1)

    if (!agent[0]) return

    if (agent[0].deletionScheduledAt) {
        cleanupAgent(agent[0].id, {
            providerServerId: agent[0].providerServerId,
            subdomain: agent[0].subdomain,
            ip: agent[0].ip
        }).catch((error) => {
            console.error('onSubscriptionRevoked', error)
            db.update(agents)
                .set({
                    subscriptionStatus: subscriptionStatus.revoked,
                    status: agentStatus.stopped
                })
                .where(eq(agents.id, agent[0].id))
                .catch(() => {})
        })
        return
    }

    if (agent[0].providerServerId) {
        const provider = getProvider()
        Promise.all([
            db
                .update(agents)
                .set({
                    subscriptionStatus: subscriptionStatus.revoked
                })
                .where(eq(agents.id, agent[0].id)),
            provider
                .stopServer(agent[0].providerServerId)
                .then(() =>
                    db
                        .update(agents)
                        .set({ status: agentStatus.stopped })
                        .where(eq(agents.id, agent[0].id))
                )
                .catch((error) => console.error('onSubscriptionRevoked', error))
        ]).catch(() => {})
    } else {
        db.update(agents)
            .set({ subscriptionStatus: subscriptionStatus.revoked })
            .where(eq(agents.id, agent[0].id))
            .catch(() => {})
    }
}

export default onSubscriptionRevoked