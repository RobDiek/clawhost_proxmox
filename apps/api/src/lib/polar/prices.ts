import type {
    CacheEntry,
    PolarItemsResult,
    PolarProductMapping,
    PolarProductRaw
} from '@/ts/Interfaces'
import type { PolarPriceMap } from '@/ts/Types'

import getPolarClient from '@/lib/polar/getPolarClient'
import getPolarConfig from '@/lib/polar/getPolarConfig'

const PRICE_CACHE_TTL = 60 * 60 * 1000

let priceCache: CacheEntry<PolarPriceMap> | null = null

const POLAR_TO_PLAN: Record<string, PolarProductMapping> = {
    CX23: { provider: 'hetzner', planId: 'cx23' },
    CX33: { provider: 'hetzner', planId: 'cx33' },
    CX43: { provider: 'hetzner', planId: 'cx43' },
    CX53: { provider: 'hetzner', planId: 'cx53' },
    CPX11: { provider: 'hetzner', planId: 'cpx11' },
    CPX21: { provider: 'hetzner', planId: 'cpx21' },
    CPX31: { provider: 'hetzner', planId: 'cpx31' },
    CPX41: { provider: 'hetzner', planId: 'cpx41' },
    CPX51: { provider: 'hetzner', planId: 'cpx51' },
    CAX11: { provider: 'hetzner', planId: 'cax11' },
    CAX21: { provider: 'hetzner', planId: 'cax21' },
    CAX31: { provider: 'hetzner', planId: 'cax31' },
    CAX41: { provider: 'hetzner', planId: 'cax41' },
    CCX13: { provider: 'hetzner', planId: 'ccx13' },
    CCX23: { provider: 'hetzner', planId: 'ccx23' },
    CCX33: { provider: 'hetzner', planId: 'ccx33' },
    CCX43: { provider: 'hetzner', planId: 'ccx43' },
    CCX53: { provider: 'hetzner', planId: 'ccx53' },
    CCX63: { provider: 'hetzner', planId: 'ccx63' }
}

const parseEnvVarMapping = (): Map<string, PolarProductMapping> => {
    const mapping = new Map<string, PolarProductMapping>()

    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith('POLAR_PRODUCT_') || !value?.trim()) continue

        const slug = key
            .slice('POLAR_PRODUCT_'.length)
            .replace(/_MONTHLY$/, '')
            .replace(/_YEARLY$/, '')

        const productId = value.trim()
        const plan = POLAR_TO_PLAN[slug]
        if (plan) mapping.set(productId, plan)
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

        const mapping = envMapping.get(product.id)
        if (!mapping) continue

        const price = product.prices?.[0]
        if (!price) continue

        if (!priceMap[mapping.provider]) {
            priceMap[mapping.provider] = {}
        }

        priceMap[mapping.provider][mapping.planId] = price.priceAmount / 100
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