import type { Context } from 'hono'
import type { SubscriptionWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { getEnvironment, PROD } from '@/lib/environment'
import { provisionClaw } from '@/controllers/claws'
import trackReferral from '@/controllers/webhooks/polar/trackReferral'

const onSubscriptionActive = async (
    data: SubscriptionWebhookData,
    c: Context
) => {
    const currentEnv = getEnvironment(c)
    const eventEnv = data.metadata?.environment || PROD

    if (eventEnv !== currentEnv) return

    const existingClaw = await db
        .select({ id: claws.id })
        .from(claws)
        .where(eq(claws.polarSubscriptionId, data.id))
        .limit(1)

    if (existingClaw[0]) return

    const pendingClawId = data.metadata?.pendingClawId
    if (!pendingClawId) return

    provisionClaw({
        pendingClawId,
        subscriptionId: data.id,
        customerId: data.customerId,
        productId: data.productId
    })
        .then((result) => {
            if (
                result.success &&
                result.referralCode &&
                data.metadata?.userId
            ) {
                trackReferral(
                    data.metadata.userId,
                    result.referralCode,
                    'purchase'
                )
            }
        })
        .catch((error) => console.error('onSubscriptionActive', error))
}

export default onSubscriptionActive