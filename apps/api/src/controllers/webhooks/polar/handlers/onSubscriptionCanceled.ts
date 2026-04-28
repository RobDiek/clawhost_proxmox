import type { SubscriptionWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { subscriptionStatus } from '@/lib/constants'

const onSubscriptionCanceled = async (data: SubscriptionWebhookData) => {
    const deletionScheduledAt = data.currentPeriodEnd
        ? new Date(data.currentPeriodEnd.endsWith('Z') ? data.currentPeriodEnd : `${data.currentPeriodEnd}Z`)
        : null

    await db
        .update(agents)
        .set({
            subscriptionStatus: subscriptionStatus.canceled,
            ...(deletionScheduledAt ? { deletionScheduledAt } : {})
        })
        .where(eq(agents.polarSubscriptionId, data.id))
}

export default onSubscriptionCanceled