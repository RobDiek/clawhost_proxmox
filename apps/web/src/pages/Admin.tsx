import type { FC, ReactNode } from 'react'
import type { AdminEntitySelection, AdminUserListItem } from '@/ts/Interfaces'

import { Fragment, useState, useRef, useCallback } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { userRole } from '@openclaw/shared'
import { useAuth } from '@/lib/auth'
import { ROUTES } from '@/lib'
import {
    useAdminStats,
    useAdminUsers,
    useDebouncedValue,
    useProfile
} from '@/hooks'
import {
    Header,
    LandingFooter,
    PageBackground,
    PageTitle,
    EmptyState,
    ErrorState,
    PageHeader
} from '@/components'
import {
    AdminClawsTab,
    AdminEmailsTab,
    AdminExportsTab,
    AdminPendingClawsTab,
    AdminReferralsTab,
    AdminSSHKeysTab,
    AdminUserRow,
    AdminDetailModal,
    AdminUserFilters,
    AdminVolumesTab,
    AdminWaitlistTab
} from '@/components/admin'
import { Skeleton } from '@/components/ui'
import {
    UsersIcon,
    HardDrivesIcon,
    KeyIcon,
    DatabaseIcon,
    HandshakeIcon,
    HourglassIcon,
    ClockCountdownIcon,
    ExportIcon,
    EnvelopeIcon
} from '@phosphor-icons/react'
import AdminUserSkeleton from '@/pages/AdminUserSkeleton'

const ADMIN_PAGE_SIZE = 20

const ADMIN_TABS = {
    USERS: 'users',
    CLAWS: 'claws',
    PENDING_CLAWS: 'pending',
    SSH_KEYS: 'ssh-keys',
    VOLUMES: 'volumes',
    REFERRALS: 'referrals',
    WAITLIST: 'waitlist',
    EXPORTS: 'exports',
    EMAILS: 'emails'
} as const

const Admin: FC = (): ReactNode => {
    const { loading: authLoading } = useAuth()
    const { data: profile, isLoading: isProfileLoading } = useProfile()
    const [searchParams, setSearchParams] = useSearchParams()
    const tabParam = searchParams.get('tab') || ADMIN_TABS.USERS
    const validTabs = Object.values(ADMIN_TABS) as string[]
    const activeTab = validTabs.includes(tabParam) ? tabParam : ADMIN_TABS.USERS
    const [selectedEntity, setSelectedEntity] =
        useState<AdminEntitySelection | null>(null)
    const [search, setSearch] = useState('')
    const [hasClaws, setHasClaws] = useState('all')
    const [sortOrder, setSortOrder] = useState('newest')
    const debouncedSearch = useDebouncedValue(search, 300)
    const isAdmin = profile?.role === userRole.admin
    const { data: stats } = useAdminStats()

    const setActiveTab = (tab: string) => {
        setSearchParams({ tab })
    }

    const {
        data: usersData,
        isLoading: isUsersLoading,
        isError: isUsersError,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useAdminUsers(
        ADMIN_PAGE_SIZE,
        debouncedSearch || undefined,
        hasClaws === 'all' ? undefined : hasClaws,
        sortOrder
    )

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

    if (!authLoading && !isProfileLoading && !isAdmin) {
        return <Navigate to={ROUTES.CLAWS} replace />
    }

    const allUsers = usersData?.pages.flatMap((page) => page.items) ?? []
    const totalUsers = usersData?.pages[0]?.total ?? 0
    const remainingCount = Math.max(0, totalUsers - allUsers.length)
    const nextPageSkeletonCount = Math.min(ADMIN_PAGE_SIZE, remainingCount)
    const isPageLoading = authLoading || isProfileLoading

    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title={t('admin.title')}
                description={t('admin.description')}
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
                {isPageLoading ? (
                    <Fragment>
                        <div className='mb-2 space-y-2'>
                            <Skeleton className='h-8 w-48' />
                            <Skeleton className='h-5 w-72' />
                        </div>
                        <div className='mb-6 flex gap-1'>
                            <Skeleton className='h-9 w-24 rounded-lg' />
                            <Skeleton className='h-9 w-20 rounded-lg' />
                            <Skeleton className='h-9 w-28 rounded-lg' />
                            <Skeleton className='h-9 w-24 rounded-lg' />
                        </div>
                        <div className='border-border bg-foreground/5 rounded-xl border p-4 sm:p-8'>
                            <div className='space-y-1.5'>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <AdminUserSkeleton key={i} />
                                ))}
                            </div>
                        </div>
                    </Fragment>
                ) : (
                    <Fragment>
                        <PageHeader
                            title={t('admin.title')}
                            description={t('admin.description')}
                        />

                        <div className='mb-6 flex flex-wrap gap-1'>
                            {[
                                {
                                    key: ADMIN_TABS.USERS,
                                    icon: UsersIcon,
                                    label: t('admin.usersTab'),
                                    count: stats?.users
                                },
                                {
                                    key: ADMIN_TABS.CLAWS,
                                    icon: HardDrivesIcon,
                                    label: t('admin.clawsTab'),
                                    count: stats?.claws
                                },
                                {
                                    key: ADMIN_TABS.SSH_KEYS,
                                    icon: KeyIcon,
                                    label: t('admin.sshKeysTab'),
                                    count: stats?.sshKeys
                                },
                                {
                                    key: ADMIN_TABS.VOLUMES,
                                    icon: DatabaseIcon,
                                    label: t('admin.volumesTab'),
                                    count: stats?.volumes
                                },
                                {
                                    key: ADMIN_TABS.PENDING_CLAWS,
                                    icon: HourglassIcon,
                                    label: t('admin.pendingClawsTab'),
                                    count: stats?.pendingClaws
                                },
                                {
                                    key: ADMIN_TABS.REFERRALS,
                                    icon: HandshakeIcon,
                                    label: t('admin.referralsTab'),
                                    count: stats?.referrals
                                },
                                {
                                    key: ADMIN_TABS.WAITLIST,
                                    icon: ClockCountdownIcon,
                                    label: t('admin.waitlistTab'),
                                    count: stats?.waitlist
                                },
                                {
                                    key: ADMIN_TABS.EXPORTS,
                                    icon: ExportIcon,
                                    label: t('admin.exportsTab'),
                                    count: stats?.exports
                                },
                                {
                                    key: ADMIN_TABS.EMAILS,
                                    icon: EnvelopeIcon,
                                    label: t('admin.emailsTab'),
                                    count: stats?.emails
                                }
                            ].map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                                        activeTab === tab.key
                                            ? 'bg-foreground/10 text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <tab.icon className='h-4 w-4' />
                                    {tab.label}
                                    {tab.count !== undefined &&
                                        tab.count > 0 && (
                                            <span className='text-muted-foreground text-xs'>
                                                ({tab.count})
                                            </span>
                                        )}
                                </button>
                            ))}
                        </div>

                        <div className='border-border bg-foreground/5 rounded-xl border p-4 backdrop-blur-sm sm:p-8'>
                            {activeTab === ADMIN_TABS.CLAWS && (
                                <AdminClawsTab
                                    onSelectEntity={setSelectedEntity}
                                />
                            )}
                            {activeTab === ADMIN_TABS.PENDING_CLAWS && (
                                <AdminPendingClawsTab
                                    onSelectEntity={setSelectedEntity}
                                />
                            )}
                            {activeTab === ADMIN_TABS.SSH_KEYS && (
                                <AdminSSHKeysTab
                                    onSelectEntity={setSelectedEntity}
                                />
                            )}
                            {activeTab === ADMIN_TABS.VOLUMES && (
                                <AdminVolumesTab
                                    onSelectEntity={setSelectedEntity}
                                />
                            )}
                            {activeTab === ADMIN_TABS.REFERRALS && (
                                <AdminReferralsTab
                                    onSelectEntity={setSelectedEntity}
                                />
                            )}
                            {activeTab === ADMIN_TABS.WAITLIST && (
                                <AdminWaitlistTab
                                    onSelectEntity={setSelectedEntity}
                                />
                            )}
                            {activeTab === ADMIN_TABS.EXPORTS && (
                                <AdminExportsTab
                                    onSelectEntity={setSelectedEntity}
                                />
                            )}
                            {activeTab === ADMIN_TABS.EMAILS && (
                                <AdminEmailsTab
                                    onSelectEntity={setSelectedEntity}
                                />
                            )}
                            {activeTab === ADMIN_TABS.USERS && (
                                <Fragment>
                                    <AdminUserFilters
                                        search={search}
                                        onSearchChange={setSearch}
                                        hasClaws={hasClaws}
                                        onHasClawsChange={setHasClaws}
                                        sortOrder={sortOrder}
                                        onSortOrderChange={setSortOrder}
                                    />

                                    {isUsersError ? (
                                        <div className='py-8'>
                                            <ErrorState
                                                title={t(
                                                    'admin.failedToLoadUsers'
                                                )}
                                                description={t(
                                                    'admin.failedToLoadUsersDescription'
                                                )}
                                                onRetry={() => refetch()}
                                            />
                                        </div>
                                    ) : isUsersLoading ? (
                                        <div className='space-y-1.5'>
                                            {Array.from({ length: 3 }).map(
                                                (_, i) => (
                                                    <AdminUserSkeleton
                                                        key={i}
                                                    />
                                                )
                                            )}
                                        </div>
                                    ) : !allUsers.length ? (
                                        <div className='py-8'>
                                            <EmptyState
                                                icon={
                                                    <UsersIcon className='text-primary h-10 w-10' />
                                                }
                                                title={t('admin.noUsers')}
                                                description={t(
                                                    'admin.noUsersDescription'
                                                )}
                                            />
                                        </div>
                                    ) : (
                                        <div className='space-y-1.5'>
                                            {allUsers.map(
                                                (user: AdminUserListItem) => (
                                                    <AdminUserRow
                                                        key={user.id}
                                                        user={user}
                                                        onSelect={(id) =>
                                                            setSelectedEntity({
                                                                type: 'user',
                                                                id,
                                                                data: user
                                                            })
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
                                                        <AdminUserSkeleton
                                                            key={`skeleton-${i}`}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Fragment>
                            )}
                        </div>
                    </Fragment>
                )}
            </motion.main>

            <LandingFooter />

            <AdminDetailModal
                entity={selectedEntity}
                onClose={() => setSelectedEntity(null)}
                onNavigateToUser={(userId) =>
                    setSelectedEntity({
                        type: 'user',
                        id: userId,
                        data: null
                    })
                }
            />
        </div>
    )
}

export default Admin