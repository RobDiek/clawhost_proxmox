import type { FC, ReactNode } from 'react'
import type { AgentBillingHistoryProps } from '@/ts/Interfaces'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { t } from '@openclaw/i18n'
import { ReceiptIcon } from '@phosphor-icons/react'
import { useAgentBilling, useToast } from '@/hooks'
import { useUIStore } from '@/lib/store'
import { api, handleAbortToast } from '@/lib'
import { BillingOrderCard, BillingSkeleton } from '@/components/billing'
import { SectionHeader } from '@/components/dashboard'
import { demoBillingOrders } from '@/data'

const AgentBillingHistory: FC<AgentBillingHistoryProps> = ({
    agentId,
    readOnly
}): ReactNode => {
    const {
        data,
        isLoading: liveLoading,
        isError: liveError
    } = useAgentBilling(agentId, !readOnly)
    const isLoading = readOnly ? false : liveLoading
    const isError = readOnly ? false : liveError
    const toast = useToast()
    const { showToast } = useUIStore()
    const invoiceControllersRef = useRef<Set<AbortController>>(new Set())
    useEffect(() => {
        const controllers = invoiceControllersRef.current
        return () => {
            controllers.forEach((c) => c.abort())
            controllers.clear()
        }
    }, [])
    const [loadingInvoiceIds, setLoadingInvoiceIds] = useState<Set<string>>(
        new Set()
    )

    const agentOrders = useMemo(() => {
        if (readOnly) return demoBillingOrders
        return data?.items ?? []
    }, [data, readOnly])

    const handleViewInvoice = useCallback(
        async (orderId: string) => {
            setLoadingInvoiceIds((prev) => new Set(prev).add(orderId))
            const controller = new AbortController()
            invoiceControllersRef.current.add(controller)
            try {
                const { url } = await api.getOrderInvoice(
                    orderId,
                    controller.signal
                )
                window.open(url, '_blank')
            } catch (error) {
                if (
                    !handleAbortToast(
                        error,
                        showToast,
                        'billing.invoiceCanceledNavigation'
                    )
                )
                    toast.error(t('billing.failedToLoadInvoice'))
            } finally {
                invoiceControllersRef.current.delete(controller)
            }
            setLoadingInvoiceIds((prev) => {
                const next = new Set(prev)
                next.delete(orderId)
                return next
            })
        },
        [toast, showToast]
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
            ) : agentOrders.length === 0 ? (
                <div className='flex flex-col items-center justify-center gap-2 px-6 py-8'>
                    <ReceiptIcon className='text-muted-foreground h-8 w-8' />
                    <p className='text-muted-foreground text-sm'>
                        {t('clawDetail.billingEmpty')}
                    </p>
                </div>
            ) : (
                <div className='space-y-1.5'>
                    {agentOrders.map((order) => (
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

export default AgentBillingHistory