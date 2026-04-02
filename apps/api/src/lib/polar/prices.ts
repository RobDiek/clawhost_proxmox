import type {
    CacheEntry,
    PolarItemsResult,
    PolarProductRaw
} from '@/ts/Interfaces'
import type { PolarPriceMap } from '@/ts/Types'

import getPolarClient from '@/lib/polar/getPolarClient'
import getPolarConfig from '@/lib/polar/getPolarConfig'

const PRICE_CACHE_TTL = 60 * 60 * 1000

let priceCache: CacheEntry<PolarPriceMap> | null = null

const POLAR_TO_PLAN: Record<string, string> = {
    CX23: 'cx23',
    CX33: 'cx33',
    CX43: 'cx43',
    CX53: 'cx53',
    CPX11: 'cpx11',
    CPX21: 'cpx21',
    CPX31: 'cpx31',
    CPX41: 'cpx41',
    CPX51: 'cpx51',
    CAX11: 'cax11',
    CAX21: 'cax21',
    CAX31: 'cax31',
    CAX41: 'cax41',
    CCX13: 'ccx13',
    CCX23: 'ccx23',
    CCX33: 'ccx33',
    CCX43: 'ccx43',
    CCX53: 'ccx53',
    CCX63: 'ccx63'
}

const parseEnvVarMapping = (): Map<string, string> => {
    const mapping = new Map<string, string>()

    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith('POLAR_PRODUCT_') || !value?.trim()) continue

        const slug = key
            .slice('POLAR_PRODUCT_'.length)
            .replace(/_MONTHLY$/, '')
            .replace(/_YEARLY$/, '')

        const productId = value.trim()
        const planId = POLAR_TO_PLAN[slug]
        if (planId) mapping.set(productId, planId)
    }

    return mapping
}

const fetchPricesFromPolar = async (): Promise<PolarPriceMap> => {
    const polar = getPolarClient()
    const config = getPolarConfig()
    const envMapping = parseEnvVarMapping()

    const allItems: PolarProductRaw[] = []
    let page = 1

    while (true) {
        const result = await polar.products.list({
            organizationId: config.organizationId,
            page,
            limit: 100
        })

        const batch =
            'result' in result
                ? (result.result as PolarItemsResult)
                : (result as unknown as PolarItemsResult)

        const items = (batch.items || []) as PolarProductRaw[]
        if (items.length === 0) break
        allItems.push(...items)
        page++
    }

    const priceMap: PolarPriceMap = {}

    for (const product of allItems) {
        if (product.isArchived) continue

        const planId = envMapping.get(product.id)
        if (!planId) continue

        const price = product.prices?.[0]
        if (!price) continue

        priceMap[planId] = price.priceAmount / 100
    }

    return priceMap
}

const getPlanPrices = async (): Promise<PolarPriceMap> => {
    if (priceCache && Date.now() < priceCache.expiry) {
        return priceCache.data
    }

    const prices = await fetchPricesFromPolar()
    priceCache = { data: prices, expiry: Date.now() + PRICE_CACHE_TTL }
    return prices
}

export default getPlanPrices