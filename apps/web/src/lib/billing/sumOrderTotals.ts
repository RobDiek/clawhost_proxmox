import type { BillingOrder } from '@/ts/Interfaces'

const sumOrderTotals = (orders: BillingOrder[]): number =>
    orders.reduce((sum, order) => sum + (order.totalAmount ?? 0), 0)

export default sumOrderTotals