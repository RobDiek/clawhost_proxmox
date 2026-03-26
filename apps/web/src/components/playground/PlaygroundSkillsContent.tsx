import type { FC, ReactNode } from 'react'
import type {
    BundledSkillInfo,
    ClawHubInstalledResponse,
    ClawHubSearchResult,
    ClawSkillsResponse,
    GetAgentSkillsResponse,
    PlaygroundSkillsContentProps,
    SkillEntryConfig
} from '@/ts/Interfaces'

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useDebouncedValue } from '@/hooks'
import {
    useQuery,
    useInfiniteQuery,
    useMutation,
    useQueryClient,
    keepPreviousData
} from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import {
    CircleNotchIcon,
    CubeIcon,
    DownloadSimpleIcon,
    LightningIcon,
    MagnifyingGlassIcon,
    StorefrontIcon,
    TrashIcon
} from '@phosphor-icons/react'
import PanelPlaceholder from '@/components/shared/PanelPlaceholder'
import TruncateTooltip from '@/components/shared/TruncateTooltip'
import { Skeleton } from '@/components/ui'
import { api, getLocale } from '@/lib'
import { useUIStore, useSkillsStore } from '@/lib/store'

const PAGE_SIZE = 50

const PlaygroundSkillsContent: FC<PlaygroundSkillsContentProps> = ({
    clawId,
    agentId
}): ReactNode => {
    const isAgentMode = !!agentId
    const [skills, setSkills] = useState<BundledSkillInfo[]>([])
    const [entries, setEntries] = useState<Record<string, SkillEntryConfig>>({})
    const [search, setSearch] = useState('')
    const debouncedSearch = useDebouncedValue(search.trim(), 400)
    const { pendingSkill, setPendingSkill, pendingSlug, setPendingSlug } =
        useSkillsStore()
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()
    const sentinelRef = useRef<HTMLDivElement | null>(null)
    const scrollRef = useRef<HTMLDivElement | null>(null)

    const clawQueryKey = ['claw-skills', clawId]
    const agentQueryKey = ['agent-skills', clawId, agentId]
    const browseKey = ['clawhub-browse', clawId, debouncedSearch]
    const installedKey = ['clawhub-installed', clawId, agentId]
    const updatesKey = ['clawhub-updates', clawId, agentId]

    const { data: clawSkillsData, isLoading: isClawSkillsLoading } = useQuery({
        queryKey: clawQueryKey,
        queryFn: () => api.getClawSkills(clawId),
        staleTime: 0,
        gcTime: 0,
        retry: 1
    })

    const { data: agentSkillsData, isLoading: isAgentSkillsLoading } = useQuery(
        {
            queryKey: agentQueryKey,
            queryFn: () => api.getAgentSkills(clawId, agentId!),
            enabled: isAgentMode,
            staleTime: 0,
            gcTime: 0,
            retry: 1
        }
    )

    const isBundledLoading =
        isClawSkillsLoading || (isAgentMode && isAgentSkillsLoading)

    useEffect(() => {
        if (clawSkillsData && !isAgentMode) {
            setSkills(clawSkillsData.skills || [])
            setEntries(clawSkillsData.entries || {})
        }
    }, [clawSkillsData, isAgentMode])

    const installedSet = useMemo(() => {
        const set = new Set<string>()
        agentSkillsData?.skills?.forEach((s) => set.add(s.name))
        return set
    }, [agentSkillsData])

    const skillsList = useMemo(
        () => clawSkillsData?.skills || [],
        [clawSkillsData]
    )

    const displaySkills = isAgentMode ? skillsList : skills

    const filteredBundledSkills = useMemo(() => {
        if (!search.trim()) return displaySkills
        const q = search.toLowerCase()
        return displaySkills.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                (s.description && s.description.toLowerCase().includes(q))
        )
    }, [displaySkills, search])

    const {
        data: browseData,
        isLoading: _isBrowseLoading,
        isFetchingNextPage,
        isError: isBrowseError,
        hasNextPage: browseHasNextPage,
        fetchNextPage
    } = useInfiniteQuery({
        queryKey: browseKey,
        queryFn: ({ pageParam }) =>
            api.browseClawHubSkills(clawId, {
                query: debouncedSearch || undefined,
                limit: PAGE_SIZE,
                cursor: pageParam || undefined,
                agentId
            }),
        enabled: !isBundledLoading,
        initialPageParam: null as string | null,
        getNextPageParam: (lastPage) =>
            lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
        placeholderData: keepPreviousData,
        staleTime: 0,
        gcTime: 0,
        retry: 1
    })

    const { data: installedData } = useQuery({
        queryKey: installedKey,
        queryFn: () => api.getClawHubInstalled(clawId, agentId),
        staleTime: 0,
        gcTime: 0,
        retry: 1
    })

    const { data: updatesData } = useQuery({
        queryKey: updatesKey,
        queryFn: () => api.checkClawHubUpdates(clawId, agentId),
        staleTime: 0,
        gcTime: 0,
        retry: 1
    })

    useEffect(() => {
        if (!sentinelRef.current || !scrollRef.current) return
        const observer = new IntersectionObserver(
            (observerEntries) => {
                if (
                    observerEntries[0]?.isIntersecting &&
                    browseHasNextPage &&
                    !isFetchingNextPage
                ) {
                    fetchNextPage()
                }
            },
            { root: scrollRef.current, threshold: 0.1 }
        )
        observer.observe(sentinelRef.current)
        return () => observer.disconnect()
    }, [browseHasNextPage, isFetchingNextPage, fetchNextPage])

    const clawHubSkills = useMemo(
        () => browseData?.pages.flatMap((page) => page.skills) || [],
        [browseData]
    )

    const installedSlugs = useMemo(() => {
        const set = new Set<string>()
        installedData?.skills?.forEach((s) => {
            const slug = s.slug.toLowerCase()
            set.add(slug)
            if (slug.includes('/')) {
                set.add(slug.split('/').pop()!)
            }
        })
        return set
    }, [installedData])

    const updatesMap = useMemo(() => {
        const map = new Map<string, string>()
        updatesData?.updates?.forEach((u) => {
            if (u.hasUpdate && u.latestVersion) {
                const slug = u.slug.toLowerCase()
                map.set(slug, u.latestVersion)
                if (slug.includes('/')) {
                    map.set(slug.split('/').pop()!, u.latestVersion)
                }
            }
        })
        return map
    }, [updatesData])

    const clawToggleMutation = useMutation({
        mutationFn: (name: string) => {
            const updatedSkills = skills.map((s) =>
                s.name === name ? { ...s, enabled: !s.enabled } : s
            )
            const updatedEntries: Record<string, SkillEntryConfig> = {}
            for (const skill of updatedSkills) {
                updatedEntries[skill.name] = {
                    ...entries[skill.name],
                    enabled: skill.enabled
                }
            }
            return api.updateClawSkills(clawId, { entries: updatedEntries })
        },
        onMutate: (name: string) => {
            setPendingSkill(name)
            setSkills((prev) =>
                prev.map((s) =>
                    s.name === name ? { ...s, enabled: !s.enabled } : s
                )
            )
            setEntries((prev) => {
                const current = prev[name] || { enabled: true }
                return {
                    ...prev,
                    [name]: { ...current, enabled: !current.enabled }
                }
            })
        },
        onSuccess: () => {
            setPendingSkill(null)
            queryClient.setQueryData<ClawSkillsResponse>(clawQueryKey, {
                skills,
                entries
            })
        },
        onError: (_: unknown, name: string) => {
            showToast(t('playground.skillsSaveFailed'), 'error')
            setPendingSkill(null)
            setSkills((prev) =>
                prev.map((s) =>
                    s.name === name ? { ...s, enabled: !s.enabled } : s
                )
            )
            setEntries((prev) => {
                const current = prev[name] || { enabled: true }
                return {
                    ...prev,
                    [name]: { ...current, enabled: !current.enabled }
                }
            })
        }
    })

    const installMutation = useMutation({
        mutationFn: (name: string) =>
            api.updateAgentSkills(clawId, agentId!, {
                action: 'install',
                skillName: name
            }),
        onSuccess: (_: void, name: string) => {
            showToast(t('playground.agentSkillsInstalled'), 'success')
            setPendingSkill(null)
            queryClient.setQueryData<GetAgentSkillsResponse>(
                agentQueryKey,
                (old) => {
                    if (!old) return { skills: [{ name }] }
                    if (old.skills.some((s) => s.name === name)) return old
                    return { skills: [...old.skills, { name }] }
                }
            )
        },
        onError: () => {
            showToast(t('playground.agentSkillsInstallFailed'), 'error')
            setPendingSkill(null)
        }
    })

    const removeMutation = useMutation({
        mutationFn: (name: string) =>
            api.updateAgentSkills(clawId, agentId!, {
                action: 'remove',
                skillName: name
            }),
        onSuccess: (_: void, name: string) => {
            showToast(t('playground.agentSkillsRemoved'), 'success')
            setPendingSkill(null)
            queryClient.setQueryData<GetAgentSkillsResponse>(
                agentQueryKey,
                (old) => {
                    if (!old) return { skills: [] }
                    return { skills: old.skills.filter((s) => s.name !== name) }
                }
            )
        },
        onError: () => {
            showToast(t('playground.agentSkillsRemoveFailed'), 'error')
            setPendingSkill(null)
        }
    })

    const clawHubInstallMutation = useMutation({
        mutationFn: (slug: string) =>
            api.installClawHubSkill(clawId, { slug, agentId }),
        onSuccess: (_: void, slug: string) => {
            showToast(t('playground.clawHubInstalled'), 'success')
            setPendingSlug(null)
            const normalized = slug.toLowerCase()
            queryClient.setQueryData<ClawHubInstalledResponse>(
                installedKey,
                (old) => {
                    if (!old)
                        return {
                            skills: [
                                {
                                    slug: normalized,
                                    name: normalized,
                                    version: '',
                                    hasUpdate: false
                                }
                            ]
                        }
                    if (
                        old.skills.some(
                            (s) => s.slug.toLowerCase() === normalized
                        )
                    )
                        return old
                    return {
                        skills: [
                            ...old.skills,
                            {
                                slug: normalized,
                                name: normalized,
                                version: '',
                                hasUpdate: false
                            }
                        ]
                    }
                }
            )
            queryClient.invalidateQueries({ queryKey: installedKey })
        },
        onError: () => {
            showToast(t('playground.clawHubInstallFailed'), 'error')
            setPendingSlug(null)
        }
    })

    const clawHubRemoveMutation = useMutation({
        mutationFn: (slug: string) =>
            api.removeClawHubSkill(clawId, { slug, agentId }),
        onSuccess: (_: void, slug: string) => {
            showToast(t('playground.clawHubRemoved'), 'success')
            setPendingSlug(null)
            const normalized = slug.toLowerCase()
            queryClient.setQueryData<ClawHubInstalledResponse>(
                installedKey,
                (old) => {
                    if (!old) return { skills: [] }
                    return {
                        skills: old.skills.filter(
                            (s) => s.slug.toLowerCase() !== normalized
                        )
                    }
                }
            )
        },
        onError: () => {
            showToast(t('playground.clawHubRemoveFailed'), 'error')
            setPendingSlug(null)
        }
    })

    const clawHubUpdateMutation = useMutation({
        mutationFn: (slug: string) =>
            api.updateClawHubSkill(clawId, { slug, agentId }),
        onSuccess: () => {
            showToast(t('playground.clawHubUpdated'), 'success')
            setPendingSlug(null)
            queryClient.invalidateQueries({ queryKey: installedKey })
            queryClient.invalidateQueries({ queryKey: updatesKey })
        },
        onError: () => {
            showToast(t('playground.clawHubUpdateFailed'), 'error')
            setPendingSlug(null)
        }
    })

    const handleBundledAction = useCallback(
        (name: string) => {
            if (pendingSkill) return
            if (isAgentMode) {
                setPendingSkill(name)
                if (installedSet.has(name)) {
                    removeMutation.mutate(name)
                } else {
                    installMutation.mutate(name)
                }
            } else {
                clawToggleMutation.mutate(name)
            }
        },
        [
            isAgentMode,
            pendingSkill,
            installedSet,
            removeMutation,
            installMutation,
            clawToggleMutation
        ]
    )

    const handleClawHubAction = useCallback(
        (slug: string) => {
            if (pendingSlug) return
            setPendingSlug(slug)
            const normalized = slug.toLowerCase()
            if (installedSlugs.has(normalized)) {
                if (updatesMap.has(normalized)) {
                    clawHubUpdateMutation.mutate(slug)
                } else {
                    clawHubRemoveMutation.mutate(slug)
                }
            } else {
                clawHubInstallMutation.mutate(slug)
            }
        },
        [
            pendingSlug,
            installedSlugs,
            updatesMap,
            clawHubInstallMutation,
            clawHubRemoveMutation,
            clawHubUpdateMutation
        ]
    )

    const isBundledActive = useCallback(
        (skill: BundledSkillInfo) => {
            if (isAgentMode) return installedSet.has(skill.name)
            return skill.enabled
        },
        [isAgentMode, installedSet]
    )

    const isClawHubFirstLoad = !browseData && !isBrowseError
    const hasBundledItems = filteredBundledSkills.length > 0
    const hasClawHubItems =
        !isClawHubFirstLoad && !isBrowseError && clawHubSkills.length > 0
    const isStillLoading = isBundledLoading || isClawHubFirstLoad
    const hasAnyItems = hasBundledItems || hasClawHubItems || isStillLoading

    return (
        <div
            ref={scrollRef}
            className='flex h-full flex-col overflow-y-auto px-5 pb-5'
        >
            <div className='bg-background sticky top-0 z-10 pb-3 pt-5'>
                <div className='relative'>
                    <MagnifyingGlassIcon className='text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2' />
                    <input
                        type='text'
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('playground.skillsSearch')}
                        className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border py-2 pl-8 pr-3 text-xs outline-none transition-colors focus:border-[#ef5350]/50'
                    />
                </div>
            </div>

            <div className='flex min-h-0 flex-1 flex-col'>
                {hasAnyItems ? (
                    <div className='space-y-1.5 pb-3'>
                        {isBundledLoading &&
                            Array.from({ length: 12 }).map((_, i) => (
                                <Skeleton
                                    key={`bndl-skel-${i}`}
                                    className='h-14 w-full rounded-lg'
                                />
                            ))}

                        {!isBundledLoading &&
                            filteredBundledSkills.map((skill) => {
                                const active = isBundledActive(skill)
                                const isPending = pendingSkill === skill.name

                                return (
                                    <div
                                        key={`bundled-${skill.name}`}
                                        className='border-border bg-foreground/[0.02] flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors'
                                    >
                                        <div className='min-w-0 flex-1'>
                                            <div className='flex items-center gap-2'>
                                                <CubeIcon
                                                    className='text-muted-foreground h-3 w-3 shrink-0'
                                                    weight='duotone'
                                                />
                                                <TruncateTooltip
                                                    content={skill.name}
                                                >
                                                    <span className='text-foreground block truncate text-xs font-medium'>
                                                        {skill.name}
                                                    </span>
                                                </TruncateTooltip>
                                            </div>
                                            {skill.description && (
                                                <TruncateTooltip
                                                    content={skill.description}
                                                >
                                                    <span className='text-muted-foreground mt-0.5 block truncate text-[11px]'>
                                                        {skill.description}
                                                    </span>
                                                </TruncateTooltip>
                                            )}
                                        </div>
                                        <button
                                            onClick={() =>
                                                handleBundledAction(skill.name)
                                            }
                                            disabled={!!pendingSkill}
                                            className='bg-foreground/5 text-foreground/80 hover:bg-foreground/10 ml-3 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
                                        >
                                            {isPending ? (
                                                <CircleNotchIcon className='h-3 w-3 animate-spin' />
                                            ) : active ? (
                                                <Fragment>
                                                    <TrashIcon className='h-3 w-3' />
                                                    {t(
                                                        'playground.clawHubRemove'
                                                    )}
                                                </Fragment>
                                            ) : (
                                                <Fragment>
                                                    <DownloadSimpleIcon className='h-3 w-3' />
                                                    {t(
                                                        'playground.clawHubInstall'
                                                    )}
                                                </Fragment>
                                            )}
                                        </button>
                                    </div>
                                )
                            })}

                        {!isBundledLoading &&
                            isClawHubFirstLoad &&
                            Array.from({ length: 12 }).map((_, i) => (
                                <Skeleton
                                    key={`ch-skel-${i}`}
                                    className='h-14 w-full rounded-lg'
                                />
                            ))}

                        {!isClawHubFirstLoad &&
                            !isBrowseError &&
                            clawHubSkills.map((skill: ClawHubSearchResult) => {
                                const normalizedSlug = skill.slug.toLowerCase()
                                const isInstalled =
                                    installedSlugs.has(normalizedSlug)
                                const hasUpdate = updatesMap.has(normalizedSlug)
                                const latestVersion =
                                    updatesMap.get(normalizedSlug)
                                const isPending = pendingSlug === skill.slug

                                return (
                                    <div
                                        key={`clawhub-${skill.slug}`}
                                        className='border-border bg-foreground/[0.02] flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors'
                                    >
                                        <div className='min-w-0 flex-1'>
                                            <div className='flex items-center gap-2'>
                                                <StorefrontIcon
                                                    className='h-3 w-3 shrink-0 text-[#ef5350]/40'
                                                    weight='duotone'
                                                />
                                                <TruncateTooltip
                                                    content={skill.name}
                                                >
                                                    <span className='text-foreground block truncate text-xs font-medium'>
                                                        {skill.name}
                                                    </span>
                                                </TruncateTooltip>
                                            </div>
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
                                                        {t(
                                                            'playground.clawHubBy',
                                                            {
                                                                author: skill.author
                                                            }
                                                        )}
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
                                            onClick={() =>
                                                handleClawHubAction(skill.slug)
                                            }
                                            disabled={!!pendingSlug}
                                            className='bg-foreground/5 text-foreground/80 hover:bg-foreground/10 ml-3 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
                                        >
                                            {isPending ? (
                                                <CircleNotchIcon className='h-3 w-3 animate-spin' />
                                            ) : isInstalled && hasUpdate ? (
                                                t('playground.clawHubUpdate')
                                            ) : isInstalled ? (
                                                <Fragment>
                                                    <TrashIcon className='h-3 w-3' />
                                                    {t(
                                                        'playground.clawHubRemove'
                                                    )}
                                                </Fragment>
                                            ) : (
                                                <Fragment>
                                                    <DownloadSimpleIcon className='h-3 w-3' />
                                                    {t(
                                                        'playground.clawHubInstall'
                                                    )}
                                                </Fragment>
                                            )}
                                        </button>
                                    </div>
                                )
                            })}

                        {isFetchingNextPage &&
                            Array.from({ length: 6 }).map((_, i) => (
                                <Skeleton
                                    key={`ch-more-${i}`}
                                    className='h-14 w-full rounded-lg'
                                />
                            ))}

                        {browseHasNextPage && !isFetchingNextPage && (
                            <div ref={sentinelRef} className='h-1' />
                        )}
                    </div>
                ) : (
                    <div className='flex flex-1 items-center justify-center'>
                        <PanelPlaceholder
                            icon={
                                <LightningIcon
                                    className='text-muted-foreground h-6 w-6'
                                    weight='duotone'
                                />
                            }
                            title={
                                search.trim()
                                    ? t('playground.skillsNoResults')
                                    : t('playground.skillsEmpty')
                            }
                            description={
                                isAgentMode
                                    ? t(
                                          'playground.agentSkillsEmptyDescription'
                                      )
                                    : t('playground.clawHubEmptyDescription')
                            }
                        />
                    </div>
                )}
            </div>
        </div>
    )
}

export default PlaygroundSkillsContent