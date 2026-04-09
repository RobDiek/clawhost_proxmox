import type { SubscriptionWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptionStatus } from '@/lib/constants'
import { cleanupClaw } from '@/controllers/claws/helpers'
import { getProvider } from '@/services/provider'

const onSubscriptionRevoked = async (data: SubscriptionWebhookData) => {
    const claw = await db
        .select({
            id: claws.id,
            providerServerId: claws.providerServerId,
            subdomain: claws.subdomain,
            deletionScheduledAt: claws.deletionScheduledAt
        })
        .from(claws)
        .where(eq(claws.polarSubscriptionId, data.id))
        .limit(1)

    if (!claw[0]) return

    if (claw[0].deletionScheduledAt) {
        cleanupClaw(claw[0].id, {
            providerServerId: claw[0].providerServerId,
            subdomain: claw[0].subdomain
        }).catch((error) => {
            console.error('onSubscriptionRevoked', error)
            db.update(claws)
                .set({
                    subscriptionStatus: subscriptionStatus.revoked,
                    status: clawStatus.stopped
                })
                .where(eq(claws.id, claw[0].id))
                .catch(() => {})
        })
        return
    }

    if (claw[0].providerServerId) {
        const provider = getProvider()
        Promise.all([
            db
                .update(claws)
                .set({
                    subscriptionStatus: subscriptionStatus.revoked
                })
                .where(eq(claws.id, claw[0].id)),
            provider
                .stopServer(claw[0].providerServerId)
                .then(() =>
                    db
                        .update(claws)
                        .set({ status: clawStatus.stopped })
                        .where(eq(claws.id, claw[0].id))
                )
                .catch((error) => console.error('onSubscriptionRevoked', error))
        ]).catch(() => {})
    } else {
        db.update(claws)
            .set({ subscriptionStatus: subscriptionStatus.revoked })
            .where(eq(claws.id, claw[0].id))
            .catch(() => {})
    }
}

export default onSubscriptionRevoked