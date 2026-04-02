import type {
    WebhookEvent,
    WebhookHandlers,
    CheckoutWebhookData,
    SubscriptionWebhookData
} from '@/ts/Interfaces'

import { webhookEventType } from '@/lib/constants'

const handleWebhook = async (
    event: WebhookEvent,
    handlers: WebhookHandlers
): Promise<void> => {
    switch (event.type) {
        case webhookEventType.checkoutCreated:
            await handlers.onCheckoutCreated?.(
                event.data as CheckoutWebhookData
            )
            break
        case webhookEventType.checkoutUpdated:
            await handlers.onCheckoutUpdated?.(
                event.data as CheckoutWebhookData
            )
            break
        case webhookEventType.subscriptionCreated:
            await handlers.onSubscriptionCreated?.(
                event.data as SubscriptionWebhookData
            )
            break
        case webhookEventType.subscriptionActive:
            await handlers.onSubscriptionActive?.(
                event.data as SubscriptionWebhookData
            )
            break
        case webhookEventType.subscriptionUpdated:
            await handlers.onSubscriptionUpdated?.(
                event.data as SubscriptionWebhookData
            )
            break
        case webhookEventType.subscriptionCanceled:
            await handlers.onSubscriptionCanceled?.(
                event.data as SubscriptionWebhookData
            )
            break
        case webhookEventType.subscriptionRevoked:
            await handlers.onSubscriptionRevoked?.(
                event.data as SubscriptionWebhookData
            )
            break
        case webhookEventType.subscriptionUncanceled:
            await handlers.onSubscriptionUncanceled?.(
                event.data as SubscriptionWebhookData
            )
            break
    }
}

export default handleWebhook