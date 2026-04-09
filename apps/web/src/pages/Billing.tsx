import type { FC, ReactNode } from 'react'
import type { BillingOrder } from '@/ts/Interfaces'

import { Fragment, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { useAuth } from '@/lib/auth'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { api } from '@/lib'
import { useUserStats, useBillingHistory } from '@/hooks'
import { BillingOrderCard } from '@/components/billing'
import {
    Header,
    LandingFooter,
    PageBackground,
    PageTitle,
    ActionButton,
    EmptyState,
    ErrorState,
    PageHeader
} from '@/components'
import {
    CircleNotchIcon,
    ReceiptIcon,
    ArrowSquareOutIcon
} from '@phosphor-icons/react'
import BillingSkeleton from '@/pages/BillingSkeleton'

const Billing: FC = (): ReactNode => {
    const { loading: authLoading } = useAuth()
    const { showToast } = useUIStore()

    const [loadingInvoiceIds, setLoadingInvoiceIds] = useState<Set<string>>(
        new Set()
    )
    const [isPortalLoading, setIsPortalLoading] = useState(false)

    const { data: userStats, isLoading: isStatsLoading } = useUserStats()
    const billingTotal = userStats?.orderCount ?? 0
    const knowsBillingCount = !isStatsLoading && userStats !== undefined
    const BILLING_PAGE_SIZE = 10
    const {
        data: billingData,
        isLoading: isBillingLoading,
        isError: isBillingError,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useBillingHistory(BILLING_PAGE_SIZE)

    const observerRef = useRef<IntersectionObserver | null>(null)
    const loadMoreRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (isFetchingNextPage) return
            if (observerRef.current) observerRef.current.disconnect()
            observerRef.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasNextPage) {
                    fetchNextPage()
                }
            })
            if (node) observerRef.current.observe(node)
        },
        [isFetchingNextPage, hasNextPage, fetchNextPage]
    )

    const allBillingItems =
        billingData?.pages.flatMap((page) => page.items) ?? []
    const remainingBillingCount = Math.max(
        0,
        billingTotal - allBillingItems.length
    )
    const nextPageSkeletonCount = Math.min(
        BILLING_PAGE_SIZE,
        remainingBillingCount
    )

    const handleViewInvoice = async (orderId: string) => {
        setLoadingInvoiceIds((prev) => new Set(prev).add(orderId))
        try {
            const { url } = await api.getOrderInvoice(orderId)
            window.open(url, '_blank')
        } catch {
            showToast(t('billing.failedToLoadInvoice'), TOAST_TYPE.ERROR)
        } finally {
            setLoadingInvoiceIds((prev) => {
                const next = new Set(prev)
                next.delete(orderId)
                return next
            })
        }
    }

    const handleManageBilling = async () => {
        setIsPortalLoading(true)
        try {
            const { url } = await api.getCustomerPortal()
            window.open(url, '_blank')
        } catch {
            showToast(t('billing.failedToLoadPortal'), TOAST_TYPE.ERROR)
        } finally {
            setIsPortalLoading(false)
        }
    }

    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title={t('billing.title')}
                description={t('billing.description')}
                noIndex
            />
            <PageBackground />
            <Header />

            <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className='relative mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-8'
            >
                {authLoading ? (
                    <div className='flex min-h-[60vh] items-center justify-center'>
                        <CircleNotchIcon className='text-primary h-8 w-8 animate-spin' />
                    </div>
                ) : (
                    <Fragment>
                        <PageHeader
                            title={t('billing.billingHistory')}
                            description={t('billing.manageYourBilling')}
                            action={
                                billingTotal > 0 ? (
                                    <ActionButton
                                        onClick={handleManageBilling}
                                        label={t('billing.manageBilling')}
                                        icon={
                                            isPortalLoading ? (
                                                <CircleNotchIcon className='h-5 w-5 animate-spin' />
                                            ) : (
                                                <ArrowSquareOutIcon
                                                    className='h-5 w-5'
                                                    weight='bold'
                                                />
                                            )
                                        }
                                    />
                                ) : undefined
                            }
                        />

                        <div className='border-border bg-foreground/5 rounded-xl border p-4 backdrop-blur-sm sm:p-8'>
                            {isBillingError ? (
                                <ErrorState
                                    title={t('billing.failedToLoadBilling')}
                                    description={t(
                                        'billing.failedToLoadBillingDescription'
                                    )}
                                    onRetry={() => refetch()}
                                />
                            ) : isBillingLoading &&
                              knowsBillingCount &&
                              billingTotal === 0 ? (
                                <EmptyState
                                    icon={
                                        <ReceiptIcon className='text-primary h-10 w-10' />
                                    }
                                    title={t('billing.noBillingHistory')}
                                    description={t(
                                        'billing.noBillingHistoryDescription'
                                    )}
                                />
                            ) : isBillingLoading && billingTotal > 0 ? (
                                <div className='space-y-1.5'>
                                    {Array.from({
                                        length: Math.min(
                                            billingTotal,
                                            BILLING_PAGE_SIZE
                                        )
                                    }).map((_, i) => (
                                        <BillingSkeleton key={i} />
                                    ))}
                                </div>
                            ) : isBillingLoading ? (
                                <div className='space-y-1.5'>
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <BillingSkeleton key={i} />
                                    ))}
                                </div>
                            ) : !allBillingItems.length ? (
                                <EmptyState
                                    icon={
                                        <ReceiptIcon className='text-primary h-10 w-10' />
                                    }
                                    title={t('billing.noBillingHistory')}
                                    description={t(
                                        'billing.noBillingHistoryDescription'
                                    )}
                                />
                            ) : (
                                <div className='space-y-1.5'>
                                    {allBillingItems.map(
                                        (order: BillingOrder) => (
                                            <BillingOrderCard
                                                key={order.id}
                                                order={order}
                                                loadingInvoiceIds={
                                                    loadingInvoiceIds
                                                }
                                                onViewInvoice={
                                                    handleViewInvoice
                                                }
                                            />
                                        )
                                    )}

                                    {hasNextPage && (
                                        <div
                                            ref={loadMoreRef}
                                            className='space-y-1.5'
                                        >
                                            {Array.from({
                                                length: nextPageSkeletonCount
                                            }).map((_, i) => (
                                                <BillingSkeleton
                                                    key={`skeleton-${i}`}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </Fragment>
                )}
            </motion.main>

            <LandingFooter />
        </div>
    )
}

export default Billing