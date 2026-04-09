import type { Context } from 'hono'
import type { CheckoutWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { getEnvironment, PROD } from '@/lib/environment'
import trackReferral from '@/controllers/webhooks/polar/trackReferral'

const onCheckoutUpdated = async (data: CheckoutWebhookData, c: Context) => {
    if (data.status !== 'succeeded') return

    if (data.metadata?.type === 'license' && data.metadata?.userId) {
        const currentEnv = getEnvironment(c)
        const eventEnv = data.metadata?.environment || PROD

        if (eventEnv !== currentEnv) return

        await db
            .update(users)
            .set({ hasLicense: true })
            .where(eq(users.id, data.metadata.userId))

        if (data.metadata.referralCode) {
            await trackReferral(
                data.metadata.userId,
                data.metadata.referralCode,
                'license'
            )
        }
    }
}

export default onCheckoutUpdated