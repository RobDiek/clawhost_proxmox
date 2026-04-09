import type { SubscriptionWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptionStatus } from '@/lib/constants'
import { getProvider } from '@/services/provider'

const onSubscriptionUpdated = async (data: SubscriptionWebhookData) => {
    const updated = await db
        .update(claws)
        .set({ subscriptionStatus: data.status })
        .where(eq(claws.polarSubscriptionId, data.id))
        .returning()

    if (
        data.status === subscriptionStatus.pastDue &&
        updated[0]?.providerServerId
    ) {
        try {
            const provider = getProvider()
            await provider.stopServer(updated[0].providerServerId)
            await db
                .update(claws)
                .set({ status: clawStatus.stopped })
                .where(eq(claws.id, updated[0].id))
        } catch (error) {
            console.error('onSubscriptionUpdated', error)
        }
    }
}

export default onSubscriptionUpdated