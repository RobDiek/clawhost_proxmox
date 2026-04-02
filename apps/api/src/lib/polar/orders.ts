import type {
    OrderCustomerResult,
    PolarOrdersPage,
    PolarOrderRaw,
    PolarPaginatedResult
} from '@/ts/Interfaces'

import getPolarClient from '@/lib/polar/getPolarClient'

const orders = {
    async listByCustomer(
        customerId: string,
        page: number = 1,
        limit: number = 10
    ): Promise<PolarOrdersPage> {
        const polar = getPolarClient()

        try {
            const result = await polar.orders.list({
                customerId,
                page,
                limit,
                sorting: ['-created_at']
            })

            const data =
                'result' in result
                    ? result.result
                    : (result as unknown as PolarPaginatedResult)

            const items = (data.items || []) as PolarOrderRaw[]

            return {
                items: items.map((order) => ({
                    id: order.id,
                    status: order.status,
                    subtotalAmount: order.subtotalAmount ?? order.amount ?? 0,
                    discountAmount: order.discountAmount ?? 0,
                    totalAmount: order.amount ?? 0,
                    taxAmount: order.taxAmount ?? 0,
                    currency: order.currency ?? 'usd',
                    billingReason: order.billingReason,
                    productName: order.product?.name ?? null,
                    productId: order.product?.id ?? order.productId ?? null,
                    subscriptionId: order.subscriptionId ?? null,
                    discountName: order.discount?.name ?? null,
                    createdAt:
                        order.createdAt instanceof Date
                            ? order.createdAt.toISOString()
                            : String(order.createdAt)
                })),
                totalCount: data.pagination?.totalCount ?? 0,
                maxPage: data.pagination?.maxPage ?? 1
            }
        } catch {
            return { items: [], totalCount: 0, maxPage: 1 }
        }
    },

    async listAll(
        page: number = 1,
        limit: number = 20
    ): Promise<PolarOrdersPage> {
        const polar = getPolarClient()

        try {
            const result = await polar.orders.list({
                page,
                limit,
                sorting: ['-created_at']
            })

            const data =
                'result' in result
                    ? result.result
                    : (result as unknown as PolarPaginatedResult)

            const items = (data.items || []) as PolarOrderRaw[]

            return {
                items: items.map((order) => ({
                    id: order.id,
                    status: order.status,
                    subtotalAmount: order.subtotalAmount ?? order.amount ?? 0,
                    discountAmount: order.discountAmount ?? 0,
                    totalAmount: order.amount ?? 0,
                    taxAmount: order.taxAmount ?? 0,
                    currency: order.currency ?? 'usd',
                    billingReason: order.billingReason,
                    productName: order.product?.name ?? null,
                    productId: order.product?.id ?? order.productId ?? null,
                    subscriptionId: order.subscriptionId ?? null,
                    discountName: order.discount?.name ?? null,
                    createdAt:
                        order.createdAt instanceof Date
                            ? order.createdAt.toISOString()
                            : String(order.createdAt)
                })),
                totalCount: data.pagination?.totalCount ?? 0,
                maxPage: data.pagination?.maxPage ?? 1
            }
        } catch {
            return { items: [], totalCount: 0, maxPage: 1 }
        }
    },

    async get(orderId: string): Promise<OrderCustomerResult | null> {
        const polar = getPolarClient()
        try {
            const order = await polar.orders.get({ id: orderId })
            return { customerId: order.customerId }
        } catch {
            return null
        }
    },

    async getInvoiceUrl(orderId: string): Promise<string> {
        const polar = getPolarClient()
        try {
            const invoice = await polar.orders.invoice({ id: orderId })
            return invoice.url
        } catch {
            await polar.orders.generateInvoice({ id: orderId })
            const invoice = await polar.orders.invoice({ id: orderId })
            return invoice.url
        }
    }
}

export default orders