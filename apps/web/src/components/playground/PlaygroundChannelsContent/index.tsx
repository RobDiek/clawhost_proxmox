import type { FC, ReactNode } from 'react'
import type {
    ChannelConfig,
    ChannelConfigWithApplicationId,
    ClawChannelsResponse,
    PlaygroundChannelsContentProps
} from '@/ts/Interfaces'

import { useState, useEffect, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isFeatureSupported } from '@openclaw/shared'
import { t } from '@openclaw/i18n'
import { CircleNotchIcon, ChatCircleIcon } from '@phosphor-icons/react'
import { PanelPlaceholder, VersionUnsupported } from '@/components/shared'
import { Skeleton } from '@/components/ui'
import { api, copyToClipboard } from '@/lib'
import { useUIStore, useChannelsStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { useClawVersion, CLAW_CHANNELS_QUERY_KEY } from '@/hooks'
import CHANNEL_DEFINITIONS from '@/components/playground/PlaygroundChannelsContent/channelDefinitions'
import ChannelCard from '@/components/playground/PlaygroundChannelsContent/ChannelCard'
import useWhatsAppPairing from '@/components/playground/PlaygroundChannelsContent/useWhatsAppPairing'

const PlaygroundChannelsContent: FC<PlaygroundChannelsContentProps> = ({
    clawId,
    onGoToVersions
}): ReactNode => {
    const [channels, setChannels] = useState<Record<string, ChannelConfig>>({})
    const [hasChanges, setHasChanges] = useState(false)
    const { isWhatsAppPaired, initialCheckDone, visibleSecrets, toggleSecret } =
        useChannelsStore(
            useShallow((s) => ({
                isWhatsAppPaired: s.isWhatsAppPaired,
                initialCheckDone: s.initialCheckDone,
                visibleSecrets: s.visibleSecrets,
                toggleSecret: s.toggleSecret
            }))
        )
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

    const { data, isLoading, isError } = useQuery({
        queryKey: [...CLAW_CHANNELS_QUERY_KEY, clawId],
        queryFn: () => api.getClawChannels(clawId),
        staleTime: 0,
        gcTime: 0,
        retry: 1
    })

    const versionQuery = useClawVersion(clawId, true)
    const clawVersion = versionQuery.data?.version || ''
    const versionUnsupported =
        clawVersion !== '' && !isFeatureSupported(clawVersion, 'channels')

    const whatsAppEnabled = channels.whatsapp?.enabled === true

    const whatsAppPairing = useWhatsAppPairing({ clawId, whatsAppEnabled })

    useEffect(() => {
        if (data) {
            const cleaned: Record<string, ChannelConfig> = {}
            for (const [key, config] of Object.entries(data.channels || {})) {
                const { applicationId: _, ...rest } =
                    config as ChannelConfigWithApplicationId
                cleaned[key] = rest
            }
            setChannels(cleaned)
            setHasChanges(false)
        }
    }, [data])

    const toggleChannel = useCallback((key: string) => {
        setChannels((prev) => {
            const current = prev[key] || { enabled: false }
            return {
                ...prev,
                [key]: { ...current, enabled: !current.enabled }
            }
        })
        setHasChanges(true)
    }, [])

    const updateField = useCallback(
        (channelKey: string, fieldKey: string, value: string) => {
            setChannels((prev) => {
                const current = prev[channelKey] || { enabled: false }
                return {
                    ...prev,
                    [channelKey]: { ...current, [fieldKey]: value }
                }
            })
            setHasChanges(true)
        },
        []
    )

    const copyField = useCallback(
        async (value: string) => {
            await copyToClipboard(value)
            showToast(t('common.copied'), TOAST_TYPE.SUCCESS)
        },
        [showToast]
    )

    const prepareChannels = useCallback((): Record<string, ChannelConfig> => {
        const prepared: Record<string, ChannelConfig> = {}
        for (const [key, config] of Object.entries(channels)) {
            const copy = { ...config }
            if (typeof copy.allowFrom === 'string') {
                const raw = copy.allowFrom as unknown as string
                copy.allowFrom = raw
                    ? raw
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                    : []
            }
            prepared[key] = copy
        }
        return prepared
    }, [channels])

    const saveMutation = useMutation({
        mutationFn: () =>
            api.updateClawChannels(clawId, { channels: prepareChannels() }),
        onSuccess: () => {
            showToast(t('playground.channelsSaved'), TOAST_TYPE.SUCCESS)
            setHasChanges(false)
            queryClient.setQueryData<ClawChannelsResponse>(
                [...CLAW_CHANNELS_QUERY_KEY, clawId],
                { channels }
            )
        },
        onError: () => {
            showToast(t('playground.channelsSaveFailed'), TOAST_TYPE.ERROR)
        }
    })

    if (isLoading) {
        return (
            <div className='space-y-4 p-5'>
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i}>
                        <Skeleton className='mb-2 h-5 w-32' />
                        <Skeleton className='h-10 w-full rounded-md' />
                    </div>
                ))}
            </div>
        )
    }

    if (isError) {
        return (
            <div className='flex h-full items-center justify-center p-5'>
                <PanelPlaceholder
                    icon={
                        <ChatCircleIcon
                            className='text-muted-foreground h-6 w-6'
                            weight='duotone'
                        />
                    }
                    title={t('playground.channelsLoadFailed')}
                    description={t('playground.channelsLoadFailedDescription')}
                />
            </div>
        )
    }

    return (
        <div className='flex h-full flex-col'>
            {versionUnsupported && (
                <VersionUnsupported
                    version={clawVersion}
                    feature={t('playground.tabChannels')}
                    featureKey='channels'
                    onGoToVersions={onGoToVersions}
                />
            )}
            <div
                className={`flex-1 overflow-y-auto p-5 ${versionUnsupported ? 'pointer-events-none opacity-50' : ''}`}
            >
                <p className='text-muted-foreground mb-4 text-[11px]'>
                    {t('playground.channelsDescription')}
                </p>

                <div className='space-y-3'>
                    {CHANNEL_DEFINITIONS.map((def) => {
                        const config = channels[def.key] || { enabled: false }
                        return (
                            <ChannelCard
                                key={def.key}
                                def={def}
                                config={config}
                                isWhatsAppPaired={isWhatsAppPaired}
                                visibleSecrets={visibleSecrets}
                                toggleSecret={toggleSecret}
                                toggleChannel={toggleChannel}
                                updateField={updateField}
                                copyField={copyField}
                                whatsAppPairing={whatsAppPairing}
                                initialCheckDone={initialCheckDone}
                                whatsAppEnabled={whatsAppEnabled}
                            />
                        )
                    })}
                </div>
            </div>

            <div className='border-border border-t p-4'>
                <button
                    onClick={() => saveMutation.mutate()}
                    disabled={
                        saveMutation.isPending ||
                        !hasChanges ||
                        versionUnsupported
                    }
                    className='flex w-full items-center justify-center gap-2 rounded-lg bg-[#ef5350] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#e53935] disabled:cursor-not-allowed disabled:opacity-50'
                >
                    {saveMutation.isPending && (
                        <CircleNotchIcon className='h-4 w-4 animate-spin' />
                    )}
                    {t('playground.channelsSave')}
                </button>
            </div>
        </div>
    )
}

export default PlaygroundChannelsContent