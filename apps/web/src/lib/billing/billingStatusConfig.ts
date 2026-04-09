import type { BillingStatusConfig } from '@/ts/Interfaces'

const billingStatusConfig: Record<string, BillingStatusConfig> = {
    paid: {
        className:
            'pointer-events-none border-green-500/30 bg-green-500/20 text-green-600 dark:text-green-400',
        labelKey: 'billing.statusPaid'
    },
    pending: {
        className:
            'pointer-events-none border-yellow-500/30 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
        labelKey: 'billing.statusPending'
    },
    refunded: {
        className:
            'pointer-events-none border-red-500/30 bg-red-500/20 text-red-600 dark:text-red-400',
        labelKey: 'billing.statusRefunded'
    },
    partially_refunded: {
        className:
            'pointer-events-none border-orange-500/30 bg-orange-500/20 text-orange-600 dark:text-orange-400',
        labelKey: 'billing.statusPartiallyRefunded'
    }
}

export default billingStatusConfig