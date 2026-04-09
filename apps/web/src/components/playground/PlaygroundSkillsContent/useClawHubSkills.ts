import type {
    ClawHubInstalledResponse,
    UseClawHubSkillsParams,
    UseClawHubSkillsReturn
} from '@/ts/Interfaces'

import { useEffect, useMemo, useCallback } from 'react'
import {
    useQuery,
    useInfiniteQuery,
    useMutation,
    useQueryClient,
    keepPreviousData
} from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { api } from '@/lib'
import { useUIStore, useSkillsStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'

const PAGE_SIZE = 50

const useClawHubSkills = (
    params: UseClawHubSkillsParams
): UseClawHubSkillsReturn => {
    const {
        clawId,
        agentId,
        debouncedSearch,
        isBundledLoading,
        scrollRef,
        sentinelRef
    } = params
    const { pendingSlug, setPendingSlug } = useSkillsStore()
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

    const browseKey = ['clawhub-browse', clawId, debouncedSearch]
    const installedKey = ['clawhub-installed', clawId, agentId]
    const updatesKey = ['clawhub-updates', clawId, agentId]

    const {
        data: browseData,
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
    }, [
        browseHasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        scrollRef,
        sentinelRef
    ])

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

    const clawHubInstallMutation = useMutation({
        mutationFn: (slug: string) =>
            api.installClawHubSkill(clawId, { slug, agentId }),
        onSuccess: (_: void, slug: string) => {
            showToast(t('playground.clawHubInstalled'), TOAST_TYPE.SUCCESS)
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
            showToast(t('playground.clawHubInstallFailed'), TOAST_TYPE.ERROR)
            setPendingSlug(null)
        }
    })

    const clawHubRemoveMutation = useMutation({
        mutationFn: (slug: string) =>
            api.removeClawHubSkill(clawId, { slug, agentId }),
        onSuccess: (_: void, slug: string) => {
            showToast(t('playground.clawHubRemoved'), TOAST_TYPE.SUCCESS)
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
            showToast(t('playground.clawHubRemoveFailed'), TOAST_TYPE.ERROR)
            setPendingSlug(null)
        }
    })

    const clawHubUpdateMutation = useMutation({
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
            clawHubUpdateMutation,
            setPendingSlug
        ]
    )

    const isClawHubFirstLoad = !browseData && !isBrowseError

    return {
        clawHubSkills,
        installedSlugs,
        updatesMap,
        isClawHubFirstLoad,
        isBrowseError,
        isFetchingNextPage,
        browseHasNextPage: !!browseHasNextPage,
        handleClawHubAction
    }
}

export default useClawHubSkills