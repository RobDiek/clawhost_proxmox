import type { FC, ReactNode } from 'react'
import type { PlaygroundSkillsContentProps } from '@/ts/Interfaces'

import { useState, useRef } from 'react'
import { isFeatureSupported } from '@openclaw/shared'
import { t } from '@openclaw/i18n'
import { useDebouncedValue, useClawVersion } from '@/hooks'
import { VersionUnsupported } from '@/components/shared'
import { Skeleton } from '@/components/ui'
import { useSkillsStore } from '@/lib/store'
import useBundledSkills from '@/components/playground/PlaygroundSkillsContent/useBundledSkills'
import useClawHubSkills from '@/components/playground/PlaygroundSkillsContent/useClawHubSkills'
import BundledSkillRow from '@/components/playground/PlaygroundSkillsContent/BundledSkillRow'
import ClawHubSkillRow from '@/components/playground/PlaygroundSkillsContent/ClawHubSkillRow'
import SkillsSearchBar from '@/components/playground/PlaygroundSkillsContent/SkillsSearchBar'
import SkillsEmptyState from '@/components/playground/PlaygroundSkillsContent/SkillsEmptyState'

const PlaygroundSkillsContent: FC<PlaygroundSkillsContentProps> = ({
    clawId,
    agentId,
    onGoToVersions
}): ReactNode => {
    const isAgentMode = !!agentId
    const [search, setSearch] = useState('')
    const debouncedSearch = useDebouncedValue(search.trim(), 400)
    const { pendingSkill, pendingSlug } = useSkillsStore()
    const sentinelRef = useRef<HTMLDivElement | null>(null)
    const scrollRef = useRef<HTMLDivElement | null>(null)

    const versionQuery = useClawVersion(clawId, true)
    const clawVersion = versionQuery.data?.version || ''
    const versionUnsupported =
        clawVersion !== '' && !isFeatureSupported(clawVersion, 'skills')

    const {
        filteredBundledSkills,
        isBundledActive,
        handleBundledAction,
        isBundledLoading
    } = useBundledSkills({ clawId, agentId, isAgentMode, search })

    const {
        clawHubSkills,
        installedSlugs,
        updatesMap,
        isClawHubFirstLoad,
        isBrowseError,
        isFetchingNextPage,
        browseHasNextPage,
        handleClawHubAction
    } = useClawHubSkills({
        clawId,
        agentId,
        debouncedSearch,
        isBundledLoading,
        scrollRef,
        sentinelRef
    })

    const hasBundledItems = filteredBundledSkills.length > 0
    const hasClawHubItems =
        !isClawHubFirstLoad && !isBrowseError && clawHubSkills.length > 0
    const isStillLoading = isBundledLoading || isClawHubFirstLoad
    const hasAnyItems = hasBundledItems || hasClawHubItems || isStillLoading

    return (
        <div
            ref={scrollRef}
            className='flex h-full flex-col overflow-y-auto pb-5'
        >
            {versionUnsupported && (
                <VersionUnsupported
                    version={clawVersion}
                    feature={t('playground.tabSkills')}
                    featureKey='skills'
                    onGoToVersions={onGoToVersions}
                />
            )}
            <SkillsSearchBar
                search={search}
                onSearchChange={setSearch}
                disabled={versionUnsupported}
            />

            <div
                className={`flex min-h-0 flex-1 flex-col px-5 ${versionUnsupported ? 'pointer-events-none opacity-50' : ''}`}
            >
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
                            filteredBundledSkills.map((skill) => (
                                <BundledSkillRow
                                    key={`bundled-${skill.name}`}
                                    skill={skill}
                                    active={isBundledActive(skill)}
                                    isPending={pendingSkill === skill.name}
                                    pendingSkill={pendingSkill}
                                    onAction={handleBundledAction}
                                />
                            ))}

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
                            clawHubSkills.map((skill) => {
                                const normalizedSlug = skill.slug.toLowerCase()
                                const isInstalled =
                                    installedSlugs.has(normalizedSlug)
                                const hasUpdate = updatesMap.has(normalizedSlug)
                                const latestVersion =
                                    updatesMap.get(normalizedSlug)
                                return (
                                    <ClawHubSkillRow
                                        key={`clawhub-${skill.slug}`}
                                        skill={skill}
                                        isInstalled={isInstalled}
                                        hasUpdate={hasUpdate}
                                        latestVersion={latestVersion}
                                        isPending={pendingSlug === skill.slug}
                                        pendingSlug={pendingSlug}
                                        onAction={handleClawHubAction}
                                    />
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
                    <SkillsEmptyState
                        hasSearch={!!search.trim()}
                        isAgentMode={isAgentMode}
                    />
                )}
            </div>
        </div>
    )
}

export default PlaygroundSkillsContent