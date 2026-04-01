import type { FC, ReactNode } from 'react'
import type { AdminResourceTabProps } from '@/ts/Interfaces'

import { Fragment, useState, useRef, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { getLocale } from '@/lib'
import { useAdminClawsList, useDebouncedValue } from '@/hooks'
import {
    Badge,
    Card,
    CardContent,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger
} from '@/components/ui'
import { EmptyState, ErrorState } from '@/components'
import { PLAYGROUND_NODE_TYPE } from '@/lib/constants'
import { HardDrivesIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import AdminUserSkeleton from '@/pages/AdminUserSkeleton'

const PAGE_SIZE = 20

const AdminClawsTab: FC<AdminResourceTabProps> = ({
    onSelectEntity
}): ReactNode => {
    const [search, setSearch] = useState('')
    const [sortOrder, setSortOrder] = useState('newest')
    const debouncedSearch = useDebouncedValue(search, 300)

    const {
        data,
        isLoading,
        isError,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useAdminClawsList(PAGE_SIZE, debouncedSearch || undefined, sortOrder)

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

    return (
        <Fragment>
            <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center'>
                <div className='relative flex-1'>
                    <MagnifyingGlassIcon className='text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2' />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('admin.searchClaws')}
                        className='bg-background h-10 pl-9'
                    />
                </div>
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
                        title={t('admin.failedToLoadClaws')}
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
                            <HardDrivesIcon className='text-primary h-10 w-10' />
                        }
                        title={t('admin.noClawsFound')}
                        description={t('admin.genericEmptyDescription')}
                    />
                </div>
            ) : (
                <div className='space-y-1.5'>
                    {allItems.map((claw) => (
                        <Card
                            key={claw.id}
                            className='hover:bg-foreground/10 cursor-pointer transition-colors'
                            onClick={() =>
                                onSelectEntity({
                                    type: PLAYGROUND_NODE_TYPE.CLAW,
                                    id: claw.id,
                                    data: claw
                                })
                            }
                        >
                            <CardContent className='py-4'>
                                <div className='flex items-center justify-between'>
                                    <div className='flex items-center gap-3'>
                                        <div className='bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full'>
                                            <HardDrivesIcon className='text-muted-foreground h-4 w-4' />
                                        </div>
                                        <div>
                                            <div className='flex items-center gap-2'>
                                                <span className='font-medium'>
                                                    {claw.name}
                                                </span>
                                                <Badge
                                                    variant='outline'
                                                    className='pointer-events-none'
                                                >
                                                    {claw.status}
                                                </Badge>
                                            </div>
                                            <p className='text-muted-foreground text-sm'>
                                                {claw.ownerEmail} ·{' '}
                                                {claw.planId} ·{' '}
                                                {claw.location ||
                                                    t('admin.notSet')}
                                            </p>
                                        </div>
                                    </div>
                                    <span className='text-muted-foreground hidden shrink-0 text-sm sm:block'>
                                        {formatDate(claw.createdAt)}
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

export default AdminClawsTab