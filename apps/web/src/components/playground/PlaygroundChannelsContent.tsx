import type { FC, ReactNode } from 'react'
import type {
    ChannelConfig,
    ChannelConfigWithApplicationId,
    ChannelDefinition,
    ClawChannelsResponse,
    PlaygroundChannelsContentProps,
    WhatsAppPairStatusResponse
} from '@/ts/Interfaces'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import {
    CircleNotchIcon,
    CopyIcon,
    EyeIcon,
    EyeSlashIcon,
    WhatsappLogoIcon,
    TelegramLogoIcon,
    DiscordLogoIcon,
    SlackLogoIcon,
    ChatCircleIcon,
    CheckIcon,
    LinkSimpleIcon
} from '@phosphor-icons/react'
import { PanelPlaceholder } from '@/components'
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    Skeleton,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui'
import { api, copyToClipboard } from '@/lib'
import { useUIStore, useChannelsStore } from '@/lib/store'

const CHANNEL_DEFINITIONS: ChannelDefinition[] = [
    {
        key: 'whatsapp',
        label: 'playground.channelsWhatsApp',
        icon: WhatsappLogoIcon,
        fields: [
            {
                key: 'dmPolicy',
                label: 'playground.channelsDmPolicy',
                placeholder: 'playground.channelsDmPolicyPairing',
                type: 'select',
                options: [
                    {
                        value: 'pairing',
                        label: 'playground.channelsDmPolicyPairing'
                    },
                    { value: 'open', label: 'playground.channelsDmPolicyOpen' },
                    {
                        value: 'allowlist',
                        label: 'playground.channelsDmPolicyAllowlist'
                    },
                    {
                        value: 'disabled',
                        label: 'playground.channelsDmPolicyDisabled'
                    }
                ]
            },
            {
                key: 'allowFrom',
                label: 'playground.channelsAllowFrom',
                placeholder: 'playground.channelsAllowFromPlaceholder'
            }
        ]
    },
    {
        key: 'telegram',
        label: 'playground.channelsTelegram',
        icon: TelegramLogoIcon,
        fields: [
            {
                key: 'botToken',
                label: 'playground.channelsBotToken',
                placeholder: 'playground.channelsBotTokenPlaceholder',
                required: true,
                secret: true
            }
        ]
    },
    {
        key: 'discord',
        label: 'playground.channelsDiscord',
        icon: DiscordLogoIcon,
        fields: [
            {
                key: 'token',
                label: 'playground.channelsToken',
                placeholder: 'playground.channelsTokenPlaceholder',
                required: true,
                secret: true
            }
        ]
    },
    {
        key: 'slack',
        label: 'playground.channelsSlack',
        icon: SlackLogoIcon,
        fields: [
            {
                key: 'botToken',
                label: 'playground.channelsBotToken',
                placeholder: 'playground.channelsBotTokenPlaceholder',
                required: true,
                secret: true
            },
            {
                key: 'appToken',
                label: 'playground.channelsAppToken',
                placeholder: 'playground.channelsAppTokenPlaceholder',
                required: true,
                secret: true
            },
            {
                key: 'signingSecret',
                label: 'playground.channelsSigningSecret',
                placeholder: 'playground.channelsSigningSecretPlaceholder',
                secret: true
            }
        ]
    },
    {
        key: 'signal',
        label: 'playground.channelsSignal',
        icon: ChatCircleIcon,
        fields: [
            {
                key: 'account',
                label: 'playground.channelsAccount',
                placeholder: 'playground.channelsAccountPlaceholder',
                required: true
            }
        ]
    }
]

const UPPER_HALF = '\u2580'
const LOWER_HALF = '\u2584'
const FULL_BLOCK = '\u2588'
const qrToDataUrl = (qrText: string): string => {
    const lines = qrText.split('\n').filter((l) => l.length > 0)
    const width = Math.max(...lines.map((l) => [...l].length))
    const height = lines.length * 2
    const canvas = document.createElement('canvas')
    const scale = 4
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    lines.forEach((line, row) => {
        const chars = [...line]
        chars.forEach((ch, col) => {
            const topBlack = ch === FULL_BLOCK || ch === UPPER_HALF
            const bottomBlack = ch === FULL_BLOCK || ch === LOWER_HALF
            if (topBlack) {
                ctx.fillStyle = '#000000'
                ctx.fillRect(col * scale, row * 2 * scale, scale, scale)
            }
            if (bottomBlack) {
                ctx.fillStyle = '#000000'
                ctx.fillRect(col * scale, (row * 2 + 1) * scale, scale, scale)
            }
        })
    })
    return canvas.toDataURL()
}

const PlaygroundChannelsContent: FC<PlaygroundChannelsContentProps> = ({
    clawId
}): ReactNode => {
    const [channels, setChannels] = useState<Record<string, ChannelConfig>>({})
    const [hasChanges, setHasChanges] = useState(false)
    const {
        isPairing,
        setIsPairing,
        pollEnabled,
        setPollEnabled,
        pairUnsupported,
        setPairUnsupported,
        isWhatsAppPaired,
        setIsWhatsAppPaired,
        isRepairing,
        setIsRepairing,
        initialCheckDone,
        setInitialCheckDone,
        visibleSecrets,
        toggleSecret,
        resetPairingState
    } = useChannelsStore(
        useShallow((s) => ({
            isPairing: s.isPairing,
            setIsPairing: s.setIsPairing,
            pollEnabled: s.pollEnabled,
            setPollEnabled: s.setPollEnabled,
            pairUnsupported: s.pairUnsupported,
            setPairUnsupported: s.setPairUnsupported,
            isWhatsAppPaired: s.isWhatsAppPaired,
            setIsWhatsAppPaired: s.setIsWhatsAppPaired,
            isRepairing: s.isRepairing,
            setIsRepairing: s.setIsRepairing,
            initialCheckDone: s.initialCheckDone,
            setInitialCheckDone: s.setInitialCheckDone,
            visibleSecrets: s.visibleSecrets,
            toggleSecret: s.toggleSecret,
            resetPairingState: s.resetPairingState
        }))
    )
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

    const { data, isLoading, isError } = useQuery({
        queryKey: ['claw-channels', clawId],
        queryFn: () => api.getClawChannels(clawId),
        staleTime: 0,
        gcTime: 0,
        retry: 1
    })

    const whatsAppEnabled = channels.whatsapp?.enabled === true

    const {
        data: initialPairStatus,
        isError: initialCheckError
    } = useQuery<WhatsAppPairStatusResponse>({
        queryKey: ['whatsapp-pair-initial', clawId],
        queryFn: () => api.pairWhatsAppStatus(clawId),
        enabled: whatsAppEnabled && !initialCheckDone && !isPairing,
        retry: false,
        staleTime: Infinity
    })

    useEffect(() => {
        if (initialCheckError) {
            setInitialCheckDone(true)
            return
        }
        if (!initialPairStatus) return
        setInitialCheckDone(true)
        if (initialPairStatus.status === 'paired') {
            setIsWhatsAppPaired(true)
        }
    }, [initialPairStatus, initialCheckError])

    const previousQrRef = useRef<string | null>(null)
    const [qrRefreshed, setQrRefreshed] = useState(false)

    const { data: pairStatus } = useQuery<WhatsAppPairStatusResponse>({
        queryKey: ['whatsapp-pair-status', clawId],
        queryFn: () => api.pairWhatsAppStatus(clawId),
        enabled: pollEnabled,
        refetchInterval: 3000
    })

    const qrImageUrl = useMemo(() => {
        if (pairStatus?.status === 'qr_ready' && pairStatus.qr) {
            return qrToDataUrl(pairStatus.qr)
        }
        return ''
    }, [pairStatus])

    useEffect(() => {
        if (!pairStatus || !isPairing) return
        if (pairStatus.status === 'paired') {
            resetPairingState()
            setIsWhatsAppPaired(true)
            showToast(t('playground.channelsWhatsAppPaired'), 'success')
        }
        if (pairStatus.status === 'failed') {
            resetPairingState()
        }
    }, [pairStatus, isPairing, showToast, resetPairingState, setIsWhatsAppPaired])

    const qrRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (pairStatus?.status === 'qr_ready' && pairStatus.qr) {
            if (previousQrRef.current && previousQrRef.current !== pairStatus.qr) {
                setQrRefreshed(true)
                if (qrRefreshTimerRef.current) clearTimeout(qrRefreshTimerRef.current)
                qrRefreshTimerRef.current = setTimeout(() => setQrRefreshed(false), 7000)
            }
            previousQrRef.current = pairStatus.qr
        }
        return () => {
            if (qrRefreshTimerRef.current) clearTimeout(qrRefreshTimerRef.current)
        }
    }, [pairStatus])

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
            showToast(t('common.copied'), 'success')
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
            showToast(t('playground.channelsSaved'), 'success')
            setHasChanges(false)
            queryClient.setQueryData<ClawChannelsResponse>(
                ['claw-channels', clawId],
                { channels }
            )
        },
        onError: () => {
            showToast(t('playground.channelsSaveFailed'), 'error')
        }
    })

    const pairMutation = useMutation({
        mutationFn: (force: boolean | undefined) => api.pairWhatsApp(clawId, force),
        onSuccess: (res) => {
            if (res.status === 'already_paired') {
                setIsWhatsAppPaired(true)
                showToast(
                    t('playground.channelsWhatsAppAlreadyPaired'),
                    'success'
                )
                return
            }
            if (res.status === 'unsupported') {
                setPairUnsupported(true)
                return
            }
            setIsPairing(true)
            setQrRefreshed(false)
            previousQrRef.current = null
            setTimeout(() => setPollEnabled(true), 3000)
        },
        onError: () => {
            showToast(t('playground.channelsWhatsAppPairFailed'), 'error')
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
            <div className='flex-1 overflow-y-auto p-5'>
                <p className='text-muted-foreground mb-4 text-[11px]'>
                    {t('playground.channelsDescription')}
                </p>

                <div className='space-y-3'>
                    {CHANNEL_DEFINITIONS.map((def) => {
                        const config = channels[def.key] || { enabled: false }
                        const Icon = def.icon

                        return (
                            <div
                                key={def.key}
                                className={`rounded-lg border transition-colors ${
                                    config.enabled
                                        ? 'border-[#ef5350]/30 bg-[#ef5350]/5'
                                        : 'border-border bg-foreground/[0.02]'
                                }`}
                            >
                                <button
                                    type='button'
                                    onClick={() => toggleChannel(def.key)}
                                    className='flex w-full items-center gap-2 px-3.5 py-3'
                                >
                                    <div
                                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                            config.enabled
                                                ? 'border-[#ef5350] bg-[#ef5350]'
                                                : 'border-border bg-foreground/5'
                                        }`}
                                    >
                                        {config.enabled && (
                                            <CheckIcon
                                                className='h-3 w-3 text-white'
                                                weight='bold'
                                            />
                                        )}
                                    </div>
                                    <Icon className='text-muted-foreground h-4 w-4' />
                                    <span className='text-foreground text-sm font-medium'>
                                        {t(def.label)}
                                    </span>
                                    {def.key === 'whatsapp' &&
                                        config.enabled &&
                                        isWhatsAppPaired && (
                                        <span className='ml-auto flex items-center gap-1.5 text-[10px] font-medium text-[#25D366]'>
                                            <span className='h-1.5 w-1.5 rounded-full bg-[#25D366]' />
                                            {t(
                                                'playground.channelsWhatsAppConnected'
                                            )}
                                        </span>
                                    )}
                                </button>

                                {config.enabled && def.key === 'whatsapp' && (
                                    <div className='border-border space-y-3 border-t px-3.5 pb-3.5 pt-3'>
                                        {isPairing &&
                                        pairStatus?.status === 'qr_ready' &&
                                        pairStatus.qr ? (
                                            <div className='space-y-2'>
                                                {qrRefreshed && (
                                                    <p className='rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-500'>
                                                        {t(
                                                            'playground.channelsWhatsAppQrRefreshed'
                                                        )}
                                                    </p>
                                                )}
                                                <p className='text-muted-foreground text-[11px]'>
                                                    {t(
                                                        'playground.channelsWhatsAppScanQr'
                                                    )}
                                                </p>
                                                <div className='flex items-center justify-center rounded-md border bg-white p-4'>
                                                    <img
                                                        src={qrImageUrl}
                                                        alt='WhatsApp QR Code'
                                                        className='h-48 w-48'
                                                        style={{ imageRendering: 'pixelated' }}
                                                    />
                                                </div>
                                                <p className='text-muted-foreground text-center text-[10px]'>
                                                    {t(
                                                        'playground.channelsWhatsAppScanInstructions'
                                                    )}
                                                </p>
                                            </div>
                                        ) : isPairing ||
                                          pairMutation.isPending ||
                                          isRepairing ||
                                          (!initialCheckDone &&
                                              whatsAppEnabled) ? (
                                            <button
                                                type='button'
                                                disabled
                                                className={`flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-[11px] font-medium opacity-70 ${
                                                    isRepairing
                                                        ? 'border-border bg-foreground/5 text-muted-foreground'
                                                        : 'border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366]'
                                                }`}
                                            >
                                                <CircleNotchIcon className='h-3.5 w-3.5 animate-spin' />
                                                {t(
                                                    isRepairing
                                                        ? 'playground.channelsWhatsAppRepair'
                                                        : 'playground.channelsWhatsAppPairDevice'
                                                )}
                                            </button>
                                        ) : pairStatus?.status === 'failed' ? (
                                            <div className='space-y-2'>
                                                <p className='text-[11px] text-red-400'>
                                                    {t(
                                                        'playground.channelsWhatsAppPairFailed'
                                                    )}
                                                </p>
                                                {pairStatus.log && (
                                                    <pre className='bg-background max-h-24 overflow-auto rounded-md border p-2 font-mono text-[10px] text-red-400/70'>
                                                        {pairStatus.log}
                                                    </pre>
                                                )}
                                                <button
                                                    type='button'
                                                    onClick={() =>
                                                        pairMutation.mutate(undefined)
                                                    }
                                                    className='flex w-full items-center justify-center gap-2 rounded-md border border-[#25D366]/30 bg-[#25D366]/10 px-3 py-2 text-[11px] font-medium text-[#25D366] transition-colors hover:bg-[#25D366]/20'
                                                >
                                                    <LinkSimpleIcon className='h-3.5 w-3.5' />
                                                    {t(
                                                        'playground.channelsWhatsAppPairDevice'
                                                    )}
                                                </button>
                                            </div>
                                        ) : pairUnsupported ? (
                                            <p className='text-muted-foreground text-[11px]'>
                                                {t(
                                                    'playground.channelsWhatsAppUnsupported'
                                                )}
                                            </p>
                                        ) : isWhatsAppPaired ? (
                                            <button
                                                type='button'
                                                onClick={() => {
                                                    setIsRepairing(true)
                                                    setIsWhatsAppPaired(false)
                                                    queryClient.removeQueries({ queryKey: ['whatsapp-pair-status', clawId] })
                                                    queryClient.removeQueries({ queryKey: ['whatsapp-pair-initial', clawId] })
                                                    pairMutation.mutate(true)
                                                }}
                                                disabled={pairMutation.isPending || isPairing}
                                                className='border-border bg-foreground/5 hover:bg-foreground/10 text-muted-foreground flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
                                            >
                                                {pairMutation.isPending || isPairing ? (
                                                    <CircleNotchIcon className='h-3.5 w-3.5 animate-spin' />
                                                ) : (
                                                    <LinkSimpleIcon className='h-3.5 w-3.5' />
                                                )}
                                                {t(
                                                    'playground.channelsWhatsAppRepair'
                                                )}
                                            </button>
                                        ) : (
                                            <button
                                                type='button'
                                                onClick={() =>
                                                    pairMutation.mutate(undefined)
                                                }
                                                className='flex w-full items-center justify-center gap-2 rounded-md border border-[#25D366]/30 bg-[#25D366]/10 px-3 py-2 text-[11px] font-medium text-[#25D366] transition-colors hover:bg-[#25D366]/20'
                                            >
                                                <LinkSimpleIcon className='h-3.5 w-3.5' />
                                                {t(
                                                    'playground.channelsWhatsAppPairDevice'
                                                )}
                                            </button>
                                        )}
                                        {def.fields.map((field) => {
                                            const fieldId = `${def.key}-${String(field.key)}`
                                            const rawValue = config[field.key]
                                            const value = Array.isArray(
                                                rawValue
                                            )
                                                ? rawValue.join(', ')
                                                : (rawValue as string) || ''

                                            return (
                                                <div key={fieldId}>
                                                    <div className='mb-1.5 flex items-center justify-between'>
                                                        <label className='text-muted-foreground text-[11px] font-medium'>
                                                            {t(field.label)}
                                                        </label>
                                                    </div>
                                                    {field.type === 'select' &&
                                                    field.options ? (
                                                        <Select
                                                            value={
                                                                value ||
                                                                field.options[0]
                                                                    ?.value ||
                                                                ''
                                                            }
                                                            onValueChange={(
                                                                val
                                                            ) =>
                                                                updateField(
                                                                    def.key,
                                                                    String(
                                                                        field.key
                                                                    ),
                                                                    val
                                                                )
                                                            }
                                                        >
                                                            <SelectTrigger
                                                                placeholder={t(
                                                                    field.placeholder
                                                                )}
                                                                className='border-border bg-foreground/5 h-8 text-[11px]'
                                                            />
                                                            <SelectContent>
                                                                {field.options.map(
                                                                    (opt) => (
                                                                        <SelectItem
                                                                            key={
                                                                                opt.value
                                                                            }
                                                                            value={
                                                                                opt.value
                                                                            }
                                                                        >
                                                                            {t(
                                                                                opt.label
                                                                            )}
                                                                        </SelectItem>
                                                                    )
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        <input
                                                            type='text'
                                                            value={value}
                                                            onChange={(e) =>
                                                                updateField(
                                                                    def.key,
                                                                    String(
                                                                        field.key
                                                                    ),
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder={t(
                                                                field.placeholder
                                                            )}
                                                            className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-2.5 py-1.5 font-mono text-[11px] outline-none transition-colors focus:border-[#ef5350]/50'
                                                        />
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {config.enabled &&
                                    def.key !== 'whatsapp' &&
                                    def.fields.length > 0 && (
                                        <div className='border-border space-y-3 border-t px-3.5 pb-3.5 pt-3'>
                                            {def.fields.map((field) => {
                                                const fieldId = `${def.key}-${String(field.key)}`
                                                const isVisible =
                                                    visibleSecrets[fieldId]
                                                const value =
                                                    (config[
                                                        field.key
                                                    ] as string) || ''

                                                return (
                                                    <div key={fieldId}>
                                                        <div className='mb-1.5 flex items-center justify-between'>
                                                            <label className='text-muted-foreground text-[11px] font-medium'>
                                                                {t(field.label)}
                                                                {field.required && (
                                                                    <span className='ml-0.5 text-red-600 dark:text-red-400'>
                                                                        *
                                                                    </span>
                                                                )}
                                                            </label>
                                                            <div className='flex items-center gap-1'>
                                                                <Tooltip>
                                                                    <TooltipTrigger
                                                                        asChild
                                                                    >
                                                                        <button
                                                                            type='button'
                                                                            disabled={
                                                                                !value
                                                                            }
                                                                            onClick={() =>
                                                                                copyField(
                                                                                    value
                                                                                )
                                                                            }
                                                                            className='text-muted-foreground hover:text-foreground/80 disabled:hover:text-muted-foreground rounded p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30'
                                                                        >
                                                                            <CopyIcon className='h-3 w-3' />
                                                                        </button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        {t(
                                                                            'common.copy'
                                                                        )}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                                {field.secret && (
                                                                    <Tooltip>
                                                                        <TooltipTrigger
                                                                            asChild
                                                                        >
                                                                            <button
                                                                                type='button'
                                                                                onClick={() =>
                                                                                    toggleSecret(
                                                                                        fieldId
                                                                                    )
                                                                                }
                                                                                className='text-muted-foreground hover:text-foreground/80 rounded p-0.5 transition-colors'
                                                                            >
                                                                                {isVisible ? (
                                                                                    <EyeSlashIcon className='h-3 w-3' />
                                                                                ) : (
                                                                                    <EyeIcon className='h-3 w-3' />
                                                                                )}
                                                                            </button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent>
                                                                            {isVisible
                                                                                ? t(
                                                                                      'common.hide'
                                                                                  )
                                                                                : t(
                                                                                      'common.show'
                                                                                  )}
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <input
                                                            type={
                                                                field.secret &&
                                                                !isVisible
                                                                    ? 'password'
                                                                    : 'text'
                                                            }
                                                            value={value}
                                                            onChange={(e) =>
                                                                updateField(
                                                                    def.key,
                                                                    String(
                                                                        field.key
                                                                    ),
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder={t(
                                                                field.placeholder
                                                            )}
                                                            className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-2.5 py-1.5 font-mono text-[11px] outline-none transition-colors focus:border-[#ef5350]/50'
                                                        />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className='border-border border-t p-4'>
                <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !hasChanges}
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