import type { FC, ReactNode } from 'react'
import type { ClawBillingContentProps } from '@/ts/Interfaces'

import { useState, useMemo, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { ReceiptIcon } from '@phosphor-icons/react'
import { useBillingHistory, useToast } from '@/hooks'
import { api } from '@/lib'
import { BillingOrderCard } from '@/components/billing'
import { Skeleton } from '@/components/ui'

const ClawBillingContent: FC<ClawBillingContentProps> = ({
    claw
}): ReactNode => {
    const { data, isLoading, isError } = useBillingHistory(100)
    const toast = useToast()
    const [loadingInvoiceIds, setLoadingInvoiceIds] = useState<Set<string>>(
        new Set()
    )

    const clawOrders = useMemo(() => {
        if (!data?.pages || !claw.polarSubscriptionId) return []
        return data.pages
            .flatMap((page) => page.items)
            .filter(
                (order) => order.subscriptionId === claw.polarSubscriptionId
            )
    }, [data, claw.polarSubscriptionId])

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

    if (isLoading) {
        return (
            <div className='h-full overflow-y-auto p-5'>
                <div className='space-y-1.5'>
                    <Skeleton className='h-24 w-full rounded-lg' />
                    <Skeleton className='h-24 w-full rounded-lg' />
                </div>
            </div>
        )
    }

    if (isError) {
        return (
            <div className='flex h-full items-center justify-center'>
                <p className='text-muted-foreground text-sm'>
                    {t('billing.failedToLoadBilling')}
                </p>
            </div>
        )
    }

    if (!claw.polarSubscriptionId || clawOrders.length === 0) {
        return (
            <div className='flex h-full flex-col items-center justify-center gap-2 px-6'>
                <ReceiptIcon className='text-muted-foreground h-8 w-8' />
                <p className='text-muted-foreground text-sm'>
                    {t('clawDetail.billingEmpty')}
                </p>
            </div>
        )
    }

    return (
        <div className='h-full overflow-y-auto p-5'>
            <div className='space-y-1.5'>
                {clawOrders.map((order) => (
                    <BillingOrderCard
                        key={order.id}
                        order={order}
                        loadingInvoiceIds={loadingInvoiceIds}
                        onViewInvoice={handleViewInvoice}
                    />
                ))}
            </div>
        </div>
    )
}

export default ClawBillingContent