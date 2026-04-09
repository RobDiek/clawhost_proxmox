import type { FC, ReactNode } from 'react'
import type {
    Binding,
    ChannelConfig,
    ChannelMetaEntry,
    PlaygroundBindingsContentProps
} from '@/ts/Interfaces'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isFeatureSupported } from '@openclaw/shared'
import { t } from '@openclaw/i18n'
import {
    CircleNotchIcon,
    WhatsappLogoIcon,
    TelegramLogoIcon,
    DiscordLogoIcon,
    SlackLogoIcon,
    ChatCircleIcon,
    ChatsCircleIcon
} from '@phosphor-icons/react'
import { PanelPlaceholder, VersionUnsupported } from '@/components/shared'
import { Skeleton } from '@/components/ui'
import { api } from '@/lib'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { useClawVersion, CLAW_BINDINGS_QUERY_KEY } from '@/hooks'

const CHANNEL_META: Record<string, ChannelMetaEntry> = {
    whatsapp: { icon: WhatsappLogoIcon, label: 'playground.channelsWhatsApp' },
    telegram: { icon: TelegramLogoIcon, label: 'playground.channelsTelegram' },
    discord: { icon: DiscordLogoIcon, label: 'playground.channelsDiscord' },
    slack: { icon: SlackLogoIcon, label: 'playground.channelsSlack' },
    signal: { icon: ChatCircleIcon, label: 'playground.channelsSignal' }
}

const CHANNEL_REQUIRED_FIELDS: Record<string, string[]> = {
    whatsapp: [],
    telegram: ['botToken'],
    discord: ['token'],
    slack: ['botToken', 'appToken'],
    signal: ['account']
}

const isChannelConfigured = (key: string, config: ChannelConfig): boolean => {
    if (!config.enabled) return false
    const required = CHANNEL_REQUIRED_FIELDS[key] || []
    return required.every((field) => {
        const value = config[field as keyof ChannelConfig]
        return typeof value === 'string' && value.trim().length > 0
    })
}

const PlaygroundBindingsContent: FC<PlaygroundBindingsContentProps> = ({
    clawId,
    agentId,
    onGoToVersions
}): ReactNode => {
    const [bindings, setBindings] = useState<Binding[]>([])
    const [hasChanges, setHasChanges] = useState(false)
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: [...CLAW_BINDINGS_QUERY_KEY, clawId],
        queryFn: () => api.getClawBindings(clawId),
        staleTime: 0,
        gcTime: 0
    })

    const versionQuery = useClawVersion(clawId, true)
    const clawVersion = versionQuery.data?.version || ''
    const versionUnsupported =
        clawVersion !== '' && !isFeatureSupported(clawVersion, 'bindings')

    useEffect(() => {
        if (query.data) {
            setBindings(query.data.bindings)
            setHasChanges(false)
        }
    }, [query.data])

    const enabledChannels = useMemo(() => {
        if (!query.data) return []
        return Object.entries(query.data.channels)
            .filter(([key, config]) =>
                isChannelConfigured(key, config as ChannelConfig)
            )
            .map(([key]) => key)
    }, [query.data])

    const toggleChannel = useCallback(
        (channel: string) => {
            setBindings((prev) => {
                const existing = prev.find((b) => b.match.channel === channel)
                if (existing && existing.agentId === agentId)
                    return prev.filter((b) => b.match.channel !== channel)
                const filtered = prev.filter((b) => b.match.channel !== channel)
                return [...filtered, { agentId, match: { channel } }]
            })
            setHasChanges(true)
        },
        [agentId]
    )

    const mutation = useMutation({
        mutationFn: async () => {
            await api.updateClawBindings(clawId, { bindings })
        },
        onSuccess: () => {
            showToast(t('playground.bindingsSaved'), TOAST_TYPE.SUCCESS)
            queryClient.invalidateQueries({
                queryKey: [...CLAW_BINDINGS_QUERY_KEY, clawId]
            })
            setHasChanges(false)
        },
        onError: () => {
            showToast(t('playground.bindingsSaveFailed'), TOAST_TYPE.ERROR)
        }
    })

    const handleSave = useCallback(() => {
        if (!hasChanges) return
        mutation.mutate()
    }, [hasChanges, mutation])

    if (query.isPending) {
        return (
            <div className='space-y-3 p-5'>
                <Skeleton className='h-4 w-48' />
                <Skeleton className='h-10 w-full' />
                <Skeleton className='h-10 w-full' />
                <Skeleton className='h-10 w-full' />
            </div>
        )
    }

    if (query.isError) {
        return (
            <PanelPlaceholder
                icon={
                    <ChatsCircleIcon className='text-muted-foreground h-6 w-6' />
                }
                title={t('playground.channelsLoadFailed')}
                description={t('playground.channelsLoadFailedDescription')}
            />
        )
    }

    if (enabledChannels.length === 0) {
        return (
            <div className='flex h-full flex-col'>
                {versionUnsupported && (
                    <VersionUnsupported
                        version={clawVersion}
                        feature={t('playground.tabChannels')}
                        featureKey='bindings'
                        onGoToVersions={onGoToVersions}
                    />
                )}
                <div className='flex flex-1 items-center justify-center'>
                    <PanelPlaceholder
                        icon={
                            <ChatsCircleIcon className='text-muted-foreground h-6 w-6' />
                        }
                        title={t('playground.bindingsNoChannels')}
                        description={t(
                            'playground.bindingsNoChannelsDescription'
                        )}
                    />
                </div>
            </div>
        )
    }

    return (
        <div className='flex h-full flex-col'>
            {versionUnsupported && (
                <VersionUnsupported
                    version={clawVersion}
                    feature={t('playground.tabChannels')}
                    featureKey='bindings'
                    onGoToVersions={onGoToVersions}
                />
            )}
            <div
                className={`flex-1 overflow-y-auto p-5 ${versionUnsupported ? 'pointer-events-none opacity-50' : ''}`}
            >
                <p className='text-muted-foreground mb-4 text-xs'>
                    {t('playground.bindingsDescription')}
                </p>

                <div className='space-y-2'>
                    {enabledChannels.map((channel) => {
                        const meta = CHANNEL_META[channel]
                        if (!meta) return null
                        const Icon = meta.icon
                        const isBoundToThis = bindings.some(
                            (b) =>
                                b.match.channel === channel &&
                                b.agentId === agentId
                        )

                        return (
                            <button
                                key={channel}
                                onClick={() => toggleChannel(channel)}
                                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                    isBoundToThis
                                        ? 'border-[#ef5350]/30 bg-[#ef5350]/5'
                                        : 'border-border hover:bg-foreground/5'
                                }`}
                            >
                                <Icon className='text-muted-foreground h-4 w-4 shrink-0' />
                                <span className='text-foreground min-w-0 flex-1 text-sm font-medium'>
                                    {t(meta.label)}
                                </span>
                                <div
                                    className={`flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                                        isBoundToThis
                                            ? 'bg-[#ef5350]'
                                            : 'bg-foreground/20'
                                    }`}
                                >
                                    <div
                                        className={`h-3 w-3 rounded-full bg-white transition-transform ${
                                            isBoundToThis
                                                ? 'translate-x-3.5'
                                                : 'translate-x-0.5'
                                        }`}
                                    />
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>

            {hasChanges && (
                <div className='border-border border-t p-4'>
                    <button
                        onClick={handleSave}
                        disabled={mutation.isPending || versionUnsupported}
                        className='flex w-full items-center justify-center gap-2 rounded-lg bg-[#ef5350] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#e53935] disabled:opacity-50'
                    >
                        {mutation.isPending && (
                            <CircleNotchIcon className='h-4 w-4 animate-spin' />
                        )}
                        {t('common.save')}
                    </button>
                </div>
            )}
        </div>
    )
}

export default PlaygroundBindingsContent