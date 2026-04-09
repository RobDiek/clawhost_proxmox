import type { Context } from 'hono'
import type { WebhookEvent } from '@/ts/Interfaces'

import getPolarConfig from '@/lib/polar/getPolarConfig'
import verifyWebhookSignature from '@/lib/polar/webhooks/verifyWebhookSignature'

const parseWebhook = async (c: Context): Promise<WebhookEvent | null> => {
    const config = getPolarConfig()

    if (!config.webhookSecret) return null

    const webhookId = c.req.header('webhook-id')
    const timestamp = c.req.header('webhook-timestamp')
    const signature = c.req.header('webhook-signature')

    if (!webhookId || !timestamp || !signature) return null

    const WEBHOOK_TOLERANCE_SECONDS = 300
    const ts = parseInt(timestamp, 10)
    if (
        isNaN(ts) ||
        Math.abs(Date.now() / 1000 - ts) > WEBHOOK_TOLERANCE_SECONDS
    ) {
        return null
    }

    const payload = await c.req.text()

    if (
        !verifyWebhookSignature(
            payload,
            webhookId,
            timestamp,
            signature,
            config.webhookSecret
        )
    ) {
        return null
    }

    try {
        const event = JSON.parse(payload) as WebhookEvent
        return event
    } catch (error) {
        console.error('parseWebhook', error)
        return null
    }
}

export default parseWebhook