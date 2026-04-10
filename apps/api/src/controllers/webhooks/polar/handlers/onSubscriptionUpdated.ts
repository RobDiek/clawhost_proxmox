import type { SubscriptionWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'

const onSubscriptionUpdated = async (data: SubscriptionWebhookData) => {
    await db
        .update(claws)
        .set({ subscriptionStatus: data.status })
        .where(eq(claws.polarSubscriptionId, data.id))
}

export default onSubscriptionUpdated