import type { FC, ReactNode } from 'react'
import type { AdminResourceTabProps } from '@/ts/Interfaces'

import { Fragment, useRef, useCallback, useState } from 'react'
import { t } from '@openclaw/i18n'
import { getLocale } from '@/lib'
import { useAdminReferralsList } from '@/hooks'
import {
    Badge,
    Card,
    CardContent,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger
} from '@/components/ui'
import { EmptyState, ErrorState } from '@/components'
import { HandshakeIcon } from '@phosphor-icons/react'
import AdminUserSkeleton from '@/pages/AdminUserSkeleton'

const PAGE_SIZE = 20

const AdminReferralsTab: FC<AdminResourceTabProps> = ({
    onSelectEntity
}): ReactNode => {
    const [sortOrder, setSortOrder] = useState('newest')

    const {
        data,
        isLoading,
        isError,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useAdminReferralsList(PAGE_SIZE, sortOrder)

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

    const allItems = data?.pages.flatMap((page) => page.items) ?? []
    const total = data?.pages[0]?.total ?? 0
    const remaining = Math.max(0, total - allItems.length)
    const skeletonCount = Math.min(PAGE_SIZE, remaining)

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString(getLocale(), {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }

    const formatCurrency = (cents: number) => {
        return new Intl.NumberFormat(getLocale(), {
            style: 'currency',
            currency: 'USD'
        }).format(cents / 100)
    }

    return (
        <Fragment>
            <div className='mb-4 flex justify-end'>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                    <SelectTrigger
                        className='h-10 w-full sm:w-40'
                        placeholder={
                            sortOrder === 'newest'
                                ? t('admin.sortNewest')
                                : t('admin.sortOldest')
                        }
                    />
                    <SelectContent>
                        <SelectItem value='newest'>
                            {t('admin.sortNewest')}
                        </SelectItem>
                        <SelectItem value='oldest'>
                            {t('admin.sortOldest')}
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {isError ? (
                <div className='py-8'>
                    <ErrorState
                        title={t('admin.failedToLoadReferrals')}
                        description={t('admin.genericErrorDescription')}
                        onRetry={() => refetch()}
                    />
                </div>
            ) : isLoading ? (
                <div className='space-y-1.5'>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <AdminUserSkeleton key={i} />
                    ))}
                </div>
            ) : !allItems.length ? (
                <div className='py-8'>
                    <EmptyState
                        icon={
                            <HandshakeIcon className='text-primary h-10 w-10' />
                        }
                        title={t('admin.noReferralsFound')}
                        description={t('admin.genericEmptyDescription')}
                    />
                </div>
            ) : (
                <div className='space-y-1.5'>
                    {allItems.map((item) => (
                        <Card
                            key={item.id}
                            className='hover:bg-foreground/10 cursor-pointer transition-colors'
                            onClick={() =>
                                onSelectEntity({
                                    type: 'referral',
                                    id: item.id,
                                    data: item
                                })
                            }
                        >
                            <CardContent className='py-4'>
                                <div className='flex items-center justify-between'>
                                    <div className='flex items-center gap-3'>
                                        <div className='bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full'>
                                            <HandshakeIcon className='text-muted-foreground h-4 w-4' />
                                        </div>
                                        <div>
                                            <div className='flex items-center gap-2'>
                                                <span className='font-medium'>
                                                    {item.referrerEmail} →{' '}
                                                    {item.referredEmail}
                                                </span>
                                                <Badge
                                                    variant='outline'
                                                    className='pointer-events-none'
                                                >
                                                    {item.paymentCount} {t('affiliate.payments')}
                                                </Badge>
                                            </div>
                                            <p className='text-muted-foreground text-sm'>
                                                {formatCurrency(
                                                    item.totalEarned
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <span className='text-muted-foreground hidden shrink-0 text-sm sm:block'>
                                        {formatDate(item.createdAt)}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {hasNextPage && (
                        <div ref={loadMoreRef} className='space-y-1.5'>
                            {Array.from({ length: skeletonCount }).map(
                                (_, i) => (
                                    <AdminUserSkeleton key={`skeleton-${i}`} />
                                )
                            )}
                        </div>
                    )}
                </div>
            )}
        </Fragment>
    )
}

export default AdminReferralsTab