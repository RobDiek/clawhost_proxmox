import type { SubscriptionWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { subscriptionStatus } from '@/lib/constants'

const onSubscriptionUncanceled = async (data: SubscriptionWebhookData) => {
    await db
        .update(agents)
        .set({
            deletionScheduledAt: null,
            subscriptionStatus: subscriptionStatus.active
        })
        .where(eq(agents.polarSubscriptionId, data.id))
}

export default onSubscriptionUncanceled