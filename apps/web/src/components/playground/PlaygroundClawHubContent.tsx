import type { FC, ReactNode } from 'react'
import type {
    ClawHubInstalledResponse,
    ClawHubSearchResult,
    PlaygroundClawHubContentProps
} from '@/ts/Interfaces'

import { Fragment, useState, useCallback, useMemo, useEffect } from 'react'
import { useDebouncedValue } from '@/hooks'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import {
    ArrowsClockwiseIcon,
    CaretLeftIcon,
    CaretRightIcon,
    CircleNotchIcon,
    DownloadSimpleIcon,
    MagnifyingGlassIcon,
    StorefrontIcon,
    TrashIcon
} from '@phosphor-icons/react'
import { PanelPlaceholder, TruncateTooltip } from '@/components/shared'
import { Skeleton } from '@/components/ui'
import { api, getLocale } from '@/lib'
import { useUIStore, useClawHubStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'

const PAGE_SIZE = 50

const PlaygroundClawHubContent: FC<PlaygroundClawHubContentProps> = ({
    clawId,
    agentId
}): ReactNode => {
    const [search, setSearch] = useState('')
    const debouncedSearch = useDebouncedValue(search.trim(), 400)
    const { pendingSlug, setPendingSlug, page, setPage } = useClawHubStore()
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, setPage])

    const browseKey = ['clawhub-browse', clawId, debouncedSearch, page]
    const installedKey = ['clawhub-installed', clawId, agentId]
    const updatesKey = ['clawhub-updates', clawId, agentId]

    const {
        data: browseData,
        isLoading: isBrowseLoading,
        isFetching: isBrowseFetching,
        isError: isBrowseError
    } = useQuery({
        queryKey: browseKey,
        queryFn: () =>
            api.browseClawHubSkills(clawId, {
                query: debouncedSearch || undefined,
                limit: PAGE_SIZE,
                agentId
            }),
        staleTime: 30000,
        retry: 1,
        placeholderData: (prev) => prev
    })

    const { data: installedData } = useQuery({
        queryKey: installedKey,
        queryFn: () => api.getClawHubInstalled(clawId, agentId),
        staleTime: 30000,
        retry: 1
    })

    const { data: updatesData } = useQuery({
        queryKey: updatesKey,
        queryFn: () => api.checkClawHubUpdates(clawId, agentId),
        staleTime: 30000,
        retry: 1
    })

    const installedSlugs = useMemo(() => {
        const set = new Set<string>()
        installedData?.skills?.forEach((s) => set.add(s.slug))
        return set
    }, [installedData])

    const updatesMap = useMemo(() => {
        const map = new Map<string, string>()
        updatesData?.updates?.forEach((u) => {
            if (u.hasUpdate && u.latestVersion) {
                map.set(u.slug, u.latestVersion)
            }
        })
        return map
    }, [updatesData])

    const installMutation = useMutation({
        mutationFn: (slug: string) =>
            api.installClawHubSkill(clawId, { slug, agentId }),
        onSuccess: () => {
            showToast(t('playground.clawHubInstalled'), TOAST_TYPE.SUCCESS)
            setPendingSlug(null)
            queryClient.invalidateQueries({ queryKey: installedKey })
        },
        onError: () => {
            showToast(t('playground.clawHubInstallFailed'), TOAST_TYPE.ERROR)
            setPendingSlug(null)
        }
    })

    const removeMutation = useMutation({
        mutationFn: (slug: string) =>
            api.removeClawHubSkill(clawId, { slug, agentId }),
        onSuccess: (_: void, slug: string) => {
            showToast(t('playground.clawHubRemoved'), TOAST_TYPE.SUCCESS)
            setPendingSlug(null)
            queryClient.setQueryData<ClawHubInstalledResponse>(
                installedKey,
                (old) => {
                    if (!old) return { skills: [] }
                    return { skills: old.skills.filter((s) => s.slug !== slug) }
                }
            )
        },
        onError: () => {
            showToast(t('playground.clawHubRemoveFailed'), TOAST_TYPE.ERROR)
            setPendingSlug(null)
        }
    })

    const updateMutation = useMutation({
        mutationFn: (slug: string) =>
            api.updateClawHubSkill(clawId, { slug, agentId }),
        onSuccess: () => {
            showToast(t('playground.clawHubUpdated'), TOAST_TYPE.SUCCESS)
            setPendingSlug(null)
            queryClient.invalidateQueries({ queryKey: installedKey })
            queryClient.invalidateQueries({ queryKey: updatesKey })
        },
        onError: () => {
            showToast(t('playground.clawHubUpdateFailed'), TOAST_TYPE.ERROR)
            setPendingSlug(null)
        }
    })

    const handleAction = useCallback(
        (slug: string) => {
            if (pendingSlug) return
            setPendingSlug(slug)
            if (installedSlugs.has(slug)) {
                if (updatesMap.has(slug)) {
                    updateMutation.mutate(slug)
                } else {
                    removeMutation.mutate(slug)
                }
            } else {
                installMutation.mutate(slug)
            }
        },
        [
            pendingSlug,
            installedSlugs,
            updatesMap,
            installMutation,
            removeMutation,
            updateMutation
        ]
    )

    const skills = browseData?.skills || []
    const hasNextPage = skills.length >= PAGE_SIZE
    const isFirstLoad = isBrowseLoading && !browseData

    return (
        <div className='flex h-full flex-col'>
            <div className='px-5 pt-5'>
                <div className='relative'>
                    <MagnifyingGlassIcon className='text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2' />
                    <input
                        type='text'
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('playground.clawHubSearch')}
                        className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border py-2 pl-8 pr-8 text-xs outline-none transition-colors focus:border-[#ef5350]/50'
                    />
                    {isBrowseFetching && !isFirstLoad && (
                        <CircleNotchIcon className='text-muted-foreground absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin' />
                    )}
                </div>
            </div>

            {isFirstLoad ? (
                <div className='flex-1 space-y-1.5 px-5 pt-3'>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className='h-16 w-full rounded-lg' />
                    ))}
                </div>
            ) : isBrowseError ? (
                <div className='flex flex-1 items-center justify-center pb-16'>
                    <PanelPlaceholder
                        icon={
                            <StorefrontIcon
                                className='text-muted-foreground h-6 w-6'
                                weight='duotone'
                            />
                        }
                        title={t('playground.clawHubLoadFailed')}
                        description={t(
                            'playground.clawHubLoadFailedDescription'
                        )}
                    />
                </div>
            ) : skills.length === 0 ? (
                <div className='flex flex-1 items-center justify-center pb-16'>
                    <PanelPlaceholder
                        icon={
                            <StorefrontIcon
                                className='text-muted-foreground h-6 w-6'
                                weight='duotone'
                            />
                        }
                        title={t('playground.clawHubNoResults')}
                        description={t('playground.clawHubEmptyDescription')}
                    />
                </div>
            ) : (
                <div className='flex-1 overflow-y-auto px-5 pb-5 pt-3'>
                    <div className='space-y-1.5'>
                        {skills.map((skill: ClawHubSearchResult) => {
                            const isInstalled = installedSlugs.has(skill.slug)
                            const hasUpdate = updatesMap.has(skill.slug)
                            const latestVersion = updatesMap.get(skill.slug)
                            const isPending = pendingSlug === skill.slug

                            return (
                                <div
                                    key={skill.slug}
                                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
                                        isInstalled
                                            ? 'border-[#ef5350]/20 bg-[#ef5350]/5'
                                            : 'border-border bg-foreground/[0.02]'
                                    }`}
                                >
                                    <div className='min-w-0 flex-1'>
                                        <TruncateTooltip content={skill.name}>
                                            <span className='text-foreground block truncate text-xs font-medium'>
                                                {skill.name}
                                            </span>
                                        </TruncateTooltip>
                                        {skill.description && (
                                            <TruncateTooltip
                                                content={skill.description}
                                            >
                                                <span className='text-muted-foreground mt-0.5 block truncate text-[11px]'>
                                                    {skill.description}
                                                </span>
                                            </TruncateTooltip>
                                        )}
                                        <div className='mt-1 flex items-center gap-2'>
                                            {skill.author && (
                                                <span className='text-muted-foreground text-[10px]'>
                                                    {t('playground.clawHubBy', {
                                                        author: skill.author
                                                    })}
                                                </span>
                                            )}
                                            {skill.version && (
                                                <span className='text-muted-foreground text-[10px]'>
                                                    {t(
                                                        'playground.clawHubVersion',
                                                        {
                                                            version:
                                                                skill.version
                                                        }
                                                    )}
                                                </span>
                                            )}
                                            {skill.downloads > 0 && (
                                                <span className='text-muted-foreground text-[10px]'>
                                                    {t(
                                                        'playground.clawHubDownloads',
                                                        {
                                                            count: skill.downloads.toLocaleString(
                                                                getLocale()
                                                            )
                                                        }
                                                    )}
                                                </span>
                                            )}
                                            {hasUpdate && latestVersion && (
                                                <span className='text-[10px] text-amber-600 dark:text-amber-400'>
                                                    {t(
                                                        'playground.clawHubUpdateAvailable',
                                                        {
                                                            version:
                                                                latestVersion
                                                        }
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleAction(skill.slug)}
                                        disabled={!!pendingSlug}
                                        className={`ml-3 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                            isInstalled && hasUpdate
                                                ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400'
                                                : isInstalled
                                                  ? 'bg-foreground/5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400'
                                                  : 'bg-[#ef5350]/10 text-[#ef5350] hover:bg-[#ef5350]/20'
                                        }`}
                                    >
                                        {isPending ? (
                                            <CircleNotchIcon className='h-3 w-3 animate-spin' />
                                        ) : isInstalled && hasUpdate ? (
                                            <Fragment>
                                                <ArrowsClockwiseIcon className='h-3 w-3' />
                                                {t('playground.clawHubUpdate')}
                                            </Fragment>
                                        ) : isInstalled ? (
                                            <Fragment>
                                                <TrashIcon className='h-3 w-3' />
                                                {t('playground.clawHubRemove')}
                                            </Fragment>
                                        ) : (
                                            <Fragment>
                                                <DownloadSimpleIcon className='h-3 w-3' />
                                                {t('playground.clawHubInstall')}
                                            </Fragment>
                                        )}
                                    </button>
                                </div>
                            )
                        })}
                    </div>

                    {(page > 1 || hasNextPage) && (
                        <div className='mt-3 flex items-center justify-center gap-3'>
                            <button
                                onClick={() =>
                                    setPage((p) => Math.max(1, p - 1))
                                }
                                disabled={page <= 1}
                                className='bg-foreground/5 text-muted-foreground hover:bg-foreground/10 flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30'
                            >
                                <CaretLeftIcon className='h-3 w-3' />
                            </button>
                            <span className='text-muted-foreground text-[11px]'>
                                {page}
                            </span>
                            <button
                                onClick={() => setPage((p) => p + 1)}
                                disabled={!hasNextPage}
                                className='bg-foreground/5 text-muted-foreground hover:bg-foreground/10 flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30'
                            >
                                <CaretRightIcon className='h-3 w-3' />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default PlaygroundClawHubContent