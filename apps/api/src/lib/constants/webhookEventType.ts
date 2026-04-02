const webhookEventType = {
    checkoutCreated: 'checkout.created',
    checkoutUpdated: 'checkout.updated',
    subscriptionCreated: 'subscription.created',
    subscriptionActive: 'subscription.active',
    subscriptionUpdated: 'subscription.updated',
    subscriptionCanceled: 'subscription.canceled',
    subscriptionRevoked: 'subscription.revoked',
    subscriptionUncanceled: 'subscription.uncanceled',
    orderCreated: 'order.created',
    orderPaid: 'order.paid',
    orderRefunded: 'order.refunded'
} as const

export default webhookEventType