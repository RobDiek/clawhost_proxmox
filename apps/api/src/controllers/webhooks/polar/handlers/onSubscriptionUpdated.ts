import type { SubscriptionWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { agents } from '@/db/schema'

const onSubscriptionUpdated = async (data: SubscriptionWebhookData) => {
    await db
        .update(agents)
        .set({ subscriptionStatus: data.status })
        .where(eq(agents.polarSubscriptionId, data.id))
}

export default onSubscriptionUpdated