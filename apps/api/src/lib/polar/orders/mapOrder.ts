import type { PolarOrderRaw } from '@/ts/Interfaces'

const mapOrder = (order: PolarOrderRaw) => ({
    id: order.id,
    status: order.status,
    subtotalAmount: order.subtotalAmount ?? 0,
    discountAmount: order.discountAmount ?? 0,
    totalAmount: order.totalAmount ?? order.netAmount ?? 0,
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
})

export default mapOrder