import type { FC, ReactNode } from 'react'
import type { PlaygroundVersionsContentProps } from '@/ts/Interfaces'

import { Fragment, useState, useMemo, useRef } from 'react'
import { useDebouncedValue } from '@/hooks'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { isVersionSupported } from '@openclaw/shared'
import {
    CircleNotchIcon,
    MagnifyingGlassIcon,
    DownloadSimpleIcon,
    ArrowSquareOutIcon,
    InfoIcon
} from '@phosphor-icons/react'
import { ClawMascot, PanelPlaceholder } from '@/components/shared'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Skeleton,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui'
import { api, getLocale } from '@/lib'
import { useUIStore, useVersionsStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { CLAW_VERSIONS_QUERY_KEY, CLAW_VERSION_QUERY_KEY } from '@/hooks'

const CHANGELOG_BASE_URL = 'https://www.npmjs.com/package/openclaw/v/'

const PlaygroundVersionsContent: FC<PlaygroundVersionsContentProps> = ({
    clawId
}): ReactNode => {
    const [search, setSearch] = useState('')
    const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 300)
    const {
        installingVersion,
        setInstallingVersion,
        confirmVersion,
        setConfirmVersion
    } = useVersionsStore()
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()
    const scrollRef = useRef<HTMLDivElement | null>(null)

    const {
        data: versionsData,
        isLoading,
        isError
    } = useQuery({
        queryKey: [...CLAW_VERSIONS_QUERY_KEY, clawId],
        queryFn: () => api.getClawVersions(clawId),
        staleTime: 0,
        gcTime: 0,
        retry: 1,
        refetchOnMount: 'always'
    })

    const installMutation = useMutation({
        mutationFn: (version: string) =>
            api.installClawVersion(clawId, version),
        onSuccess: (_data, version) => {
            showToast(
                t('playground.versionInstallSuccess', { version }),
                'success'
            )
            queryClient.invalidateQueries({
                queryKey: [...CLAW_VERSIONS_QUERY_KEY, clawId]
            })
            queryClient.invalidateQueries({
                queryKey: [...CLAW_VERSION_QUERY_KEY, clawId]
            })
            setInstallingVersion(null)
        },
        onError: () => {
            showToast(t('playground.versionInstallFailed'), TOAST_TYPE.ERROR)
            setInstallingVersion(null)
        }
    })

    const filteredVersions = useMemo(() => {
        if (!versionsData?.versions) return []
        if (!debouncedSearch) return versionsData.versions
        return versionsData.versions.filter((v) =>
            v.version.toLowerCase().includes(debouncedSearch)
        )
    }, [versionsData?.versions, debouncedSearch])

    const handleInstall = (version: string) => {
        setConfirmVersion(version)
    }

    const handleConfirmInstall = () => {
        if (!confirmVersion) return
        setInstallingVersion(confirmVersion)
        installMutation.mutate(confirmVersion)
        setConfirmVersion(null)
    }

    const hasItems = isLoading || filteredVersions.length > 0

    return (
        <Fragment>
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
                            placeholder={t('playground.versionsSearch')}
                            className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border py-2 pl-8 pr-3 text-xs outline-none transition-colors focus:border-[#ef5350]/50'
                        />
                    </div>
                </div>

                <div className='flex min-h-0 flex-1 flex-col'>
                    {hasItems ? (
                        <div className='space-y-1.5 pb-3'>
                            {isLoading &&
                                Array.from({ length: 12 }).map((_, i) => (
                                    <Skeleton
                                        key={`ver-skel-${i}`}
                                        className='h-14 w-full rounded-lg'
                                    />
                                ))}

                            {!isLoading &&
                                filteredVersions.map((entry) => {
                                    const isCurrent =
                                        versionsData?.currentVersion ===
                                        entry.version
                                    const isInstalling =
                                        installingVersion === entry.version
                                    const isSupported = isVersionSupported(
                                        entry.version
                                    )

                                    return (
                                        <div
                                            key={entry.version}
                                            className={`border-border flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
                                                isCurrent
                                                    ? 'bg-foreground/[0.06]'
                                                    : 'bg-foreground/[0.02]'
                                            }`}
                                        >
                                            <div className='min-w-0 flex-1'>
                                                <div className='flex items-center gap-2'>
                                                    <ClawMascot className='h-3 w-3 shrink-0' />
                                                    <span className='text-foreground text-xs font-medium'>
                                                        {entry.version}
                                                    </span>
                                                    {isCurrent && (
                                                        <span className='rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-400'>
                                                            {t(
                                                                'playground.versionCurrent'
                                                            )}
                                                        </span>
                                                    )}
                                                    {isSupported && (
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger
                                                                    asChild
                                                                >
                                                                    <span className='flex cursor-default items-center gap-0.5 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400'>
                                                                        {t(
                                                                            'playground.versionSupported'
                                                                        )}
                                                                        <InfoIcon className='h-2.5 w-2.5' />
                                                                    </span>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    {t(
                                                                        'playground.versionSupportedTooltip'
                                                                    )}
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    )}
                                                </div>
                                                <div className='mt-0.5 flex items-center gap-2'>
                                                    <span className='text-muted-foreground text-[10px]'>
                                                        {new Date(
                                                            entry.publishedAt
                                                        ).toLocaleDateString(
                                                            getLocale(),
                                                            {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric'
                                                            }
                                                        )}
                                                    </span>
                                                    <span className='text-muted-foreground text-[10px]'>
                                                        ·
                                                    </span>
                                                    <span className='text-muted-foreground text-[10px]'>
                                                        {t(
                                                            'playground.versionDownloads',
                                                            {
                                                                count: new Intl.NumberFormat(
                                                                    getLocale()
                                                                ).format(
                                                                    entry.downloads
                                                                )
                                                            }
                                                        )}
                                                    </span>
                                                    <span className='text-muted-foreground text-[10px]'>
                                                        ·
                                                    </span>
                                                    <a
                                                        href={`${CHANGELOG_BASE_URL}${entry.version}`}
                                                        target='_blank'
                                                        rel='noopener noreferrer'
                                                        onClick={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                        className='text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-[10px] transition-colors'
                                                    >
                                                        <ArrowSquareOutIcon className='h-2.5 w-2.5' />
                                                        {t(
                                                            'playground.versionChangelog'
                                                        )}
                                                    </a>
                                                </div>
                                            </div>

                                            {!isCurrent && (
                                                <button
                                                    onClick={() =>
                                                        handleInstall(
                                                            entry.version
                                                        )
                                                    }
                                                    disabled={
                                                        installingVersion !==
                                                        null
                                                    }
                                                    className='bg-foreground/5 text-foreground/80 hover:bg-foreground/10 ml-3 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
                                                >
                                                    {isInstalling ? (
                                                        <Fragment>
                                                            <CircleNotchIcon className='h-3 w-3 animate-spin' />
                                                            {t(
                                                                'playground.versionInstalling'
                                                            )}
                                                        </Fragment>
                                                    ) : (
                                                        <Fragment>
                                                            <DownloadSimpleIcon className='h-3 w-3' />
                                                            {t(
                                                                'playground.versionInstall'
                                                            )}
                                                        </Fragment>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                        </div>
                    ) : (
                        <div className='flex flex-1 items-center justify-center'>
                            {isError ? (
                                <PanelPlaceholder
                                    icon={<ClawMascot className='h-5 w-5' />}
                                    title={t('playground.versionsEmpty')}
                                    description={t(
                                        'playground.versionsErrorDescription'
                                    )}
                                />
                            ) : (
                                <PanelPlaceholder
                                    icon={<ClawMascot className='h-5 w-5' />}
                                    title={t('playground.versionsEmpty')}
                                    description={t(
                                        'playground.versionsEmptyDescription'
                                    )}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Dialog
                open={confirmVersion !== null}
                onOpenChange={(open) => {
                    if (!open) setConfirmVersion(null)
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('playground.versionInstallConfirmTitle', {
                                version: confirmVersion ?? ''
                            })}
                        </DialogTitle>
                        <DialogDescription>
                            {t('playground.versionInstallConfirmDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className='mt-4 flex justify-end gap-3'>
                        <Button
                            variant='outline'
                            onClick={() => setConfirmVersion(null)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant='destructive'
                            onClick={handleConfirmInstall}
                        >
                            {t('playground.versionInstall')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Fragment>
    )
}

export default PlaygroundVersionsContent