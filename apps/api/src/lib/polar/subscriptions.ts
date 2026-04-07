import type {
    CacheEntry,
    PolarSubscription,
    PolarSubscriptionRaw,
    PolarItemsResult
} from '@/ts/Interfaces'
import type { SubscriptionStatus } from '@/ts/Types'

import getPolarClient from '@/lib/polar/getPolarClient'

const SUB_CACHE_TTL = 60_000
const subCache = new Map<string, CacheEntry<PolarSubscription>>()
const subInflight = new Map<string, Promise<PolarSubscription | null>>()

const subscriptions = {
    async get(subscriptionId: string): Promise<PolarSubscription | null> {
        const cached = subCache.get(subscriptionId)
        if (cached && Date.now() < cached.expiry) return cached.data

        const pending = subInflight.get(subscriptionId)
        if (pending) return pending

        const polar = getPolarClient()

        const promise = polar.subscriptions
            .get({ id: subscriptionId })
            .then((sub) => {
                const result: PolarSubscription = {
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
                    canceledAt: sub.canceledAt
                        ? new Date(sub.canceledAt)
                        : undefined,
                    endedAt: sub.endedAt ? new Date(sub.endedAt) : undefined,
                    metadata: sub.metadata as Record<string, string> | undefined
                }
                subCache.set(subscriptionId, {
                    data: result,
                    expiry: Date.now() + SUB_CACHE_TTL
                })
                subInflight.delete(subscriptionId)
                return result as PolarSubscription | null
            })
            .catch(() => {
                subInflight.delete(subscriptionId)
                return null as PolarSubscription | null
            })

        subInflight.set(subscriptionId, promise)
        return promise
    },

    async getMany(ids: string[]): Promise<Map<string, PolarSubscription>> {
        const result = new Map<string, PolarSubscription>()
        if (ids.length === 0) return result

        const unique = [...new Set(ids)]
        const results = await Promise.all(
            unique.map((id) => this.get(id).then((sub) => ({ id, sub })))
        )

        for (const { id, sub } of results) {
            if (sub) result.set(id, sub)
        }

        return result
    },

    async listByCustomer(customerId: string): Promise<PolarSubscription[]> {
        const polar = getPolarClient()

        try {
            const result = await polar.subscriptions.list({
                customerId
            })

            const items =
                'result' in result
                    ? result.result
                    : (result as unknown as PolarItemsResult).items || []

            return (items as PolarSubscriptionRaw[]).map((sub) => ({
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
                canceledAt: sub.canceledAt
                    ? new Date(sub.canceledAt)
                    : undefined,
                endedAt: sub.endedAt ? new Date(sub.endedAt) : undefined,
                metadata: sub.metadata as Record<string, string> | undefined
            }))
        } catch {
            return []
        }
    },

    async cancel(subscriptionId: string): Promise<PolarSubscription | null> {
        const polar = getPolarClient()

        try {
            const sub = await polar.subscriptions.update({
                id: subscriptionId,
                subscriptionUpdate: {
                    cancelAtPeriodEnd: true
                }
            })
            return {
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
                canceledAt: sub.canceledAt
                    ? new Date(sub.canceledAt)
                    : undefined,
                endedAt: sub.endedAt ? new Date(sub.endedAt) : undefined,
                metadata: sub.metadata as Record<string, string> | undefined
            }
        } catch {
            return null
        }
    },

    async uncancel(subscriptionId: string): Promise<PolarSubscription | null> {
        const polar = getPolarClient()

        try {
            const sub = await polar.subscriptions.update({
                id: subscriptionId,
                subscriptionUpdate: {
                    cancelAtPeriodEnd: false
                }
            })
            return {
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
                canceledAt: sub.canceledAt
                    ? new Date(sub.canceledAt)
                    : undefined,
                endedAt: sub.endedAt ? new Date(sub.endedAt) : undefined,
                metadata: sub.metadata as Record<string, string> | undefined
            }
        } catch {
            return null
        }
    },

    async changeProduct(
        subscriptionId: string,
        productId: string
    ): Promise<PolarSubscription | null> {
        const polar = getPolarClient()

        try {
            const sub = await polar.subscriptions.update({
                id: subscriptionId,
                subscriptionUpdate: {
                    productId
                }
            })
            subCache.delete(subscriptionId)
            return {
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
                canceledAt: sub.canceledAt
                    ? new Date(sub.canceledAt)
                    : undefined,
                endedAt: sub.endedAt ? new Date(sub.endedAt) : undefined,
                metadata: sub.metadata as Record<string, string> | undefined
            }
        } catch {
            return null
        }
    },

    async revoke(subscriptionId: string): Promise<void> {
        const polar = getPolarClient()
        try {
            await polar.subscriptions.revoke({ id: subscriptionId })
        } catch (error) {
            const body =
                error && typeof error === 'object' && 'body' in error
                    ? String((error as { body: unknown }).body)
                    : ''
            if (body.includes('AlreadyCanceledSubscription')) return
            throw error
        }
    }
}

export default subscriptions