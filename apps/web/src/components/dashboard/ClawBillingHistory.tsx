import type { FC, ReactNode } from 'react'
import type { ClawBillingHistoryProps } from '@/ts/Interfaces'

import { useState, useMemo, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { ReceiptIcon } from '@phosphor-icons/react'
import { useBillingHistory, useToast } from '@/hooks'
import { api } from '@/lib'
import { BillingOrderCard, BillingSkeleton } from '@/components/billing'
import { SectionHeader } from '@/components/dashboard'
import { demoBillingOrders } from '@/data'

const ClawBillingHistory: FC<ClawBillingHistoryProps> = ({
    polarSubscriptionId,
    readOnly
}): ReactNode => {
    const { data, isLoading: liveLoading, isError: liveError } = useBillingHistory(100, !readOnly)
    const isLoading = readOnly ? false : liveLoading
    const isError = readOnly ? false : liveError
    const toast = useToast()
    const [loadingInvoiceIds, setLoadingInvoiceIds] = useState<Set<string>>(
        new Set()
    )

    const clawOrders = useMemo(() => {
        if (readOnly) return demoBillingOrders
        if (!data?.pages || !polarSubscriptionId) return []
        return data.pages
            .flatMap((page) => page.items)
            .filter(
                (order) => order.subscriptionId === polarSubscriptionId
            )
    }, [data, polarSubscriptionId, readOnly])

    const handleViewInvoice = useCallback(
        async (orderId: string) => {
            setLoadingInvoiceIds((prev) => new Set(prev).add(orderId))
            try {
                const { url } = await api.getOrderInvoice(orderId)
                window.open(url, '_blank')
            } catch {
                toast.error(t('billing.failedToLoadInvoice'))
            }
            setLoadingInvoiceIds((prev) => {
                const next = new Set(prev)
                next.delete(orderId)
                return next
            })
        },
        [toast]
    )

    return (
        <div className='space-y-3'>
            <SectionHeader title={t('dashboard.history')} />

            {isLoading ? (
                <div className='space-y-1.5'>
                    <BillingSkeleton />
                    <BillingSkeleton />
                    <BillingSkeleton />
                </div>
            ) : isError ? (
                <div className='flex flex-col items-center justify-center gap-2 px-6 py-8'>
                    <ReceiptIcon className='text-muted-foreground h-8 w-8' />
                    <p className='text-muted-foreground text-sm'>
                        {t('billing.failedToLoadBilling')}
                    </p>
                </div>
            ) : clawOrders.length === 0 ? (
                <div className='flex flex-col items-center justify-center gap-2 px-6 py-8'>
                    <ReceiptIcon className='text-muted-foreground h-8 w-8' />
                    <p className='text-muted-foreground text-sm'>
                        {t('clawDetail.billingEmpty')}
                    </p>
                </div>
            ) : (
                <div className='space-y-1.5'>
                    {clawOrders.map((order) => (
                        <BillingOrderCard
                            key={order.id}
                            order={order}
                            loadingInvoiceIds={loadingInvoiceIds}
                            onViewInvoice={handleViewInvoice}
                            readOnly={readOnly}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

export default ClawBillingHistory