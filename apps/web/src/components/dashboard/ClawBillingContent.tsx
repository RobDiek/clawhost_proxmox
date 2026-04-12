import type { FC, ReactNode } from 'react'
import type { ClawBillingContentProps } from '@/ts/Interfaces'

import { useState, useMemo, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import {
    ReceiptIcon,
    CreditCardIcon,
    CircleNotchIcon
} from '@phosphor-icons/react'
import { useBillingHistory, useCustomerPortal, useToast } from '@/hooks'
import { api, getLocale } from '@/lib'
import { BillingOrderCard } from '@/components/billing'
import { CopyableField, SectionHeader } from '@/components/dashboard'
import { Button, Skeleton } from '@/components/ui'

const ClawBillingContent: FC<ClawBillingContentProps> = ({
    claw,
    plans
}): ReactNode => {
    const plan = plans.find((p) => p.id === claw.planId)
    const monthlyPrice = plan ? plan.priceMonthly : null
    const { openPortal, isLoading: isPortalLoading } = useCustomerPortal()
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

    const manageBillingAction = claw.polarSubscriptionId ? (
        <Button
            variant='outline'
            size='sm'
            onClick={() => openPortal(claw.id)}
            disabled={isPortalLoading}
            className={claw.subscriptionStatus === 'past_due' ? 'border-orange-500/50 text-orange-600 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-400' : ''}
        >
            {isPortalLoading ? (
                <CircleNotchIcon className='mr-2 h-3.5 w-3.5 animate-spin' />
            ) : (
                <CreditCardIcon className='mr-2 h-3.5 w-3.5' />
            )}
            {claw.subscriptionStatus === 'past_due'
                ? t('dashboard.updatePayment')
                : t('billing.manageBilling')}
        </Button>
    ) : undefined

    return (
        <div className='h-full space-y-4 overflow-y-auto p-5'>
            <SectionHeader
                title={t('clawDetail.tabBilling')}
                action={manageBillingAction}
            />

            <div className='grid grid-cols-2 gap-2'>
                {monthlyPrice && (
                    <CopyableField
                        label={t('dashboard.planCost')}
                        value={
                            claw.billingInterval === 'year' && plan
                                ? t('landing.pricePerYear', {
                                      price: plan.priceYearly.toFixed(0)
                                  })
                                : t('landing.pricePerMonth', {
                                      price: monthlyPrice.toFixed(0)
                                  })
                        }
                    />
                )}
                {claw.currentPeriodStart && (
                    <CopyableField
                        label={t('dashboard.lastBilling')}
                        value={new Date(
                            claw.currentPeriodStart
                        ).toLocaleDateString(getLocale(), {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        })}
                    />
                )}
                {claw.currentPeriodEnd && (
                    <CopyableField
                        label={t('dashboard.nextBilling')}
                        value={new Date(
                            claw.currentPeriodEnd
                        ).toLocaleDateString(getLocale(), {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        })}
                    />
                )}
            </div>

            <SectionHeader title={t('account.billingHistory')} />

            {clawOrders.length === 0 ? (
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
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

export default ClawBillingContent