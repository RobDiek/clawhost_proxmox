import type { PolarSubscription, PolarSubscriptionRaw } from '@/ts/Interfaces'
import type { SubscriptionStatus } from '@/ts/Types'

const mapSubscription = (sub: PolarSubscriptionRaw): PolarSubscription => ({
    id: sub.id,
    status: sub.status as SubscriptionStatus,
    customerId: sub.customerId,
    productId: sub.productId,
    amount: sub.amount ?? 0,
    currency: sub.currency ?? 'usd',
    currentPeriodStart: sub.currentPeriodStart
        ? new Date(sub.currentPeriodStart)
        : undefined,
    currentPeriodEnd: sub.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd)
        : undefined,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
    canceledAt: sub.canceledAt ? new Date(sub.canceledAt) : undefined,
    endedAt: sub.endedAt ? new Date(sub.endedAt) : undefined,
    metadata: sub.metadata as Record<string, string> | undefined
})

export default mapSubscription