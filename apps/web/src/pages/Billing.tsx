import type { FC, ReactNode } from 'react'
import type { BillingOrder } from '@/ts/Interfaces'

import { Fragment, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { useAuth } from '@/lib/auth'
import { useUIStore } from '@/lib/store'
import { api, getLocale } from '@/lib'
import { useUserStats, useBillingHistory } from '@/hooks'
import { Badge, Card, CardContent, Button } from '@/components/ui'
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
    DownloadSimpleIcon,
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

    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return '...'
        return new Date(dateString).toLocaleDateString(getLocale(), {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat(getLocale(), {
            style: 'currency',
            currency: currency.toUpperCase()
        }).format(amount / 100)
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'paid':
                return (
                    <Badge className='pointer-events-none border-green-500/30 bg-green-500/20 text-green-600 dark:text-green-400'>
                        {t('billing.statusPaid')}
                    </Badge>
                )
            case 'pending':
                return (
                    <Badge className='pointer-events-none border-yellow-500/30 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'>
                        {t('billing.statusPending')}
                    </Badge>
                )
            case 'refunded':
                return (
                    <Badge className='pointer-events-none border-red-500/30 bg-red-500/20 text-red-600 dark:text-red-400'>
                        {t('billing.statusRefunded')}
                    </Badge>
                )
            case 'partially_refunded':
                return (
                    <Badge className='pointer-events-none border-orange-500/30 bg-orange-500/20 text-orange-600 dark:text-orange-400'>
                        {t('billing.statusPartiallyRefunded')}
                    </Badge>
                )
            default:
                return (
                    <Badge variant='outline' className='pointer-events-none'>
                        {status}
                    </Badge>
                )
        }
    }

    const getBillingReasonLabel = (reason: string) => {
        switch (reason) {
            case 'purchase':
                return t('billing.billingReasonPurchase')
            case 'subscription_create':
                return t('billing.billingReasonSubscriptionCreate')
            case 'subscription_cycle':
                return t('billing.billingReasonSubscriptionCycle')
            case 'subscription_update':
                return t('billing.billingReasonSubscriptionUpdate')
            default:
                return reason
        }
    }

    const handleViewInvoice = async (orderId: string) => {
        setLoadingInvoiceIds((prev) => new Set(prev).add(orderId))
        try {
            const { url } = await api.getOrderInvoice(orderId)
            window.open(url, '_blank')
        } catch {
            showToast(t('billing.failedToLoadInvoice'), 'error')
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
            showToast(t('billing.failedToLoadPortal'), 'error')
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
                                            <Card key={order.id}>
                                                <CardContent className='py-4'>
                                                    <div className='hidden sm:flex sm:items-center sm:justify-between'>
                                                        <div>
                                                            <h3 className='font-semibold'>
                                                                {order.productName ||
                                                                    getBillingReasonLabel(
                                                                        order.billingReason
                                                                    )}
                                                            </h3>
                                                            <p className='text-muted-foreground text-sm'>
                                                                {formatDate(
                                                                    order.createdAt
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className='flex items-center gap-4'>
                                                            <div className='text-right text-sm'>
                                                                <div className='flex items-center gap-2 font-medium'>
                                                                    {order.discountAmount >
                                                                        0 && (
                                                                        <span className='text-muted-foreground line-through'>
                                                                            {formatCurrency(
                                                                                order.subtotalAmount,
                                                                                order.currency
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                    <span>
                                                                        {formatCurrency(
                                                                            order.totalAmount,
                                                                            order.currency
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                {order.discountName && (
                                                                    <p className='text-muted-foreground text-xs'>
                                                                        {t(
                                                                            'billing.couponApplied',
                                                                            {
                                                                                name: order.discountName
                                                                            }
                                                                        )}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            {getStatusBadge(
                                                                order.status
                                                            )}
                                                            <Button
                                                                variant='ghost'
                                                                size='icon'
                                                                onClick={() =>
                                                                    handleViewInvoice(
                                                                        order.id
                                                                    )
                                                                }
                                                                disabled={loadingInvoiceIds.has(
                                                                    order.id
                                                                )}
                                                                title={t(
                                                                    'billing.viewInvoice'
                                                                )}
                                                            >
                                                                {loadingInvoiceIds.has(
                                                                    order.id
                                                                ) ? (
                                                                    <CircleNotchIcon className='h-5 w-5 animate-spin' />
                                                                ) : (
                                                                    <DownloadSimpleIcon className='h-5 w-5' />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <div className='flex flex-col gap-3 sm:hidden'>
                                                        <div className='flex items-start justify-between'>
                                                            <div>
                                                                <h3 className='font-semibold'>
                                                                    {order.productName ||
                                                                        getBillingReasonLabel(
                                                                            order.billingReason
                                                                        )}
                                                                </h3>
                                                                <p className='text-muted-foreground text-sm'>
                                                                    {formatDate(
                                                                        order.createdAt
                                                                    )}
                                                                </p>
                                                            </div>
                                                            {getStatusBadge(
                                                                order.status
                                                            )}
                                                        </div>
                                                        <div className='flex items-center justify-between'>
                                                            <div className='text-sm'>
                                                                <div className='flex items-center gap-2 font-medium'>
                                                                    {order.discountAmount >
                                                                        0 && (
                                                                        <span className='text-muted-foreground line-through'>
                                                                            {formatCurrency(
                                                                                order.subtotalAmount,
                                                                                order.currency
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                    <span>
                                                                        {formatCurrency(
                                                                            order.totalAmount,
                                                                            order.currency
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                {order.discountName && (
                                                                    <p className='text-muted-foreground text-xs'>
                                                                        {t(
                                                                            'billing.couponApplied',
                                                                            {
                                                                                name: order.discountName
                                                                            }
                                                                        )}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <Button
                                                                variant='ghost'
                                                                size='icon'
                                                                onClick={() =>
                                                                    handleViewInvoice(
                                                                        order.id
                                                                    )
                                                                }
                                                                disabled={loadingInvoiceIds.has(
                                                                    order.id
                                                                )}
                                                                title={t(
                                                                    'billing.viewInvoice'
                                                                )}
                                                            >
                                                                {loadingInvoiceIds.has(
                                                                    order.id
                                                                ) ? (
                                                                    <CircleNotchIcon className='h-5 w-5 animate-spin' />
                                                                ) : (
                                                                    <DownloadSimpleIcon className='h-5 w-5' />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
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