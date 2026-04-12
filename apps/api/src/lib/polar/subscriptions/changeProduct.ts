import type { PolarSubscription } from '@/ts/Interfaces'

import getPolarClient from '@/lib/polar/getPolarClient'
import mapSubscription from '@/lib/polar/subscriptions/mapSubscription'
import { subCache } from '@/lib/polar/subscriptions/cache'

const changeProduct = async (
    subscriptionId: string,
    productId: string
): Promise<PolarSubscription | null> => {
    const polar = getPolarClient()

    try {
        const sub = await polar.subscriptions.update({
            id: subscriptionId,
            subscriptionUpdate: {
                productId
            }
        })
        subCache.delete(subscriptionId)
        return mapSubscription(sub as never)
    } catch {
        return null
    }
}

export default changeProduct