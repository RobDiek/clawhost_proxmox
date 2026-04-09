import type { SubscriptionWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptionStatus } from '@/lib/constants'

const onSubscriptionUncanceled = async (data: SubscriptionWebhookData) => {
    await db
        .update(claws)
        .set({
            deletionScheduledAt: null,
            subscriptionStatus: subscriptionStatus.active
        })
        .where(eq(claws.polarSubscriptionId, data.id))
}

export default onSubscriptionUncanceled