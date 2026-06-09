import type { Context } from 'hono'
import type { CheckoutWebhookData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { parseWebhook, handleWebhook } from '@/lib/polar'
import { ok, fail } from '@/lib/response'
import { getEnvironment, PROD } from '@/lib/environment'
import { t } from '@openclaw/i18n'

const handlePolarWebhook = async (c: Context) => {
    try {
        const event = await parseWebhook(c)

        if (!event) {
            return fail(c, t('api.invalidWebhook'), 400)
        }

        await handleWebhook(event, {
            onCheckoutUpdated: async (data: CheckoutWebhookData) => {
                if (data.status !== 'succeeded') {
                    return
                }

                if (data.metadata?.type === 'license' && data.metadata?.userId) {
                    const currentEnv = getEnvironment(c)
                    const eventEnv = data.metadata?.environment || PROD

                    if (eventEnv !== currentEnv) {
                        return
                    }

                    await db
                        .update(users)
                        .set({ hasLicense: true })
                        .where(eq(users.id, data.metadata.userId))
                }
            }
        })

        return ok(c, { received: true }, t('api.webhookReceived'))
    } catch (err) {
        console.error('Webhook error:', err)
        return fail(c, t('api.webhookProcessingFailed'), 500)
    }
}

export default handlePolarWebhook