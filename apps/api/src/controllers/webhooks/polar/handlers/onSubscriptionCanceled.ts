import type { SubscriptionWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptionStatus } from '@/lib/constants'

const onSubscriptionCanceled = async (data: SubscriptionWebhookData) => {
    const deletionScheduledAt = data.currentPeriodEnd
        ? new Date(data.currentPeriodEnd)
        : null

    await db
        .update(claws)
        .set({
            subscriptionStatus: subscriptionStatus.canceled,
            ...(deletionScheduledAt ? { deletionScheduledAt } : {})
        })
        .where(eq(claws.polarSubscriptionId, data.id))
}

export default onSubscriptionCanceled