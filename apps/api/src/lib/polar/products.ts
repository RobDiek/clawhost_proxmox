import type {
    PolarProduct,
    PolarProductRaw,
    PolarItemsResult,
    CreatePolarProductParams
} from '@/ts/Interfaces'

import getPolarClient from '@/lib/polar/getPolarClient'
import getPolarConfig from '@/lib/polar/getPolarConfig'

const products = {
    async list(): Promise<PolarProduct[]> {
        const polar = getPolarClient()
        const config = getPolarConfig()

        const result = await polar.products.list({
            organizationId: config.organizationId
        })

        const items =
            'result' in result
                ? result.result
                : (result as unknown as PolarItemsResult).items || []

        return (items as PolarProductRaw[]).map((product) => ({
            id: product.id,
            name: product.name,
            description: product.description ?? undefined,
            isRecurring: product.isRecurring,
            isArchived: product.isArchived
        }))
    },

    async get(productId: string): Promise<PolarProduct | null> {
        const polar = getPolarClient()

        try {
            const product = await polar.products.get({ id: productId })
            return {
                id: product.id,
                name: product.name,
                description: product.description ?? undefined,
                isRecurring: product.isRecurring,
                isArchived: product.isArchived
            }
        } catch {
            return null
        }
    },

    async create(data: CreatePolarProductParams): Promise<PolarProduct> {
        const polar = getPolarClient()
        const config = getPolarConfig()

        const product = await polar.products.create({
            name: data.name,
            description: data.description,
            organizationId: config.organizationId,
            prices: [
                {
                    amountType: 'fixed',
                    priceAmount: data.priceAmountCents,
                    priceCurrency: 'usd'
                }
            ] as Parameters<typeof polar.products.create>[0]['prices']
        })

        return {
            id: product.id,
            name: product.name,
            description: product.description ?? undefined,
            isRecurring: product.isRecurring,
            isArchived: product.isArchived
        }
    },

    async archive(productId: string): Promise<void> {
        const polar = getPolarClient()
        await polar.products.update({
            id: productId,
            productUpdate: {
                isArchived: true
            }
        })
    }
}

export default products