import type { FC, ReactNode } from 'react'
import type {
    ElectronWindow,
    PlaygroundDetailPanelProps,
    PlaygroundTabConfig
} from '@/ts/Interfaces'
import type { PlaygroundDetailTab } from '@/ts/Types'
import type { TranslationKey } from '@openclaw/i18n'

import { useCallback, useState, useMemo, useEffect } from 'react'
import { CLAW_DETAIL_TABS } from '@/lib/constants'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import {
    clawProvider,
    clawStatus,
    inputValidation,
    OPENCLAW_VERSION
} from '@openclaw/shared'
import { getBaseDomain, TRUNCATE_LENGTHS } from '@/lib'
import {
    XIcon,
    InfoIcon,
    ScrollIcon,
    PulseIcon,
    KeyIcon,
    LightningIcon,
    GearSixIcon,
    TerminalWindowIcon,
    ArrowSquareOutIcon,
    ChatsCircleIcon
} from '@phosphor-icons/react'
import { ClawAvatar, ClawMascotOutline } from '@/components/shared'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import {
    ClawLogsContent,
    ClawDiagnosticsContent,
    ClawTerminalContent
} from '@/components/dashboard'
import {
    PlaygroundVariablesContent,
    PlaygroundSkillsContent,
    PlaygroundVersionsContent,
    PlaygroundChannelsContent,
    PlaygroundDetailInfoTab,
    PlaygroundDetailSettingsTab
} from '@/components/playground'
import { useQueryClient } from '@tanstack/react-query'
import { useClawVersion, useRenameClaw, useUpdateClawSubdomain } from '@/hooks'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import CLAW_VERSION_QUERY_KEY from '@/hooks/useClaws/CLAW_VERSION_QUERY_KEY'
import { generateSlug } from '@/lib/claw-utils'

const tabStateMap: Record<string, PlaygroundDetailTab> = {}

const tabs: PlaygroundTabConfig<PlaygroundDetailTab>[] = [
    { id: CLAW_DETAIL_TABS.INFO, label: 'playground.tabInfo', icon: InfoIcon },
    {
        id: CLAW_DETAIL_TABS.CHANNELS,
        label: 'playground.tabChannels',
        icon: ChatsCircleIcon
    },
    {
        id: CLAW_DETAIL_TABS.TERMINAL,
        label: 'playground.tabTerminal',
        icon: TerminalWindowIcon
    },
    {
        id: CLAW_DETAIL_TABS.LOGS,
        label: 'playground.tabLogs',
        icon: ScrollIcon
    },
    {
        id: CLAW_DETAIL_TABS.VARIABLES,
        label: 'playground.tabEnvs',
        icon: KeyIcon
    },
    {
        id: CLAW_DETAIL_TABS.SKILLS,
        label: 'playground.tabSkills',
        icon: LightningIcon
    },
    {
        id: CLAW_DETAIL_TABS.VERSIONS,
        label: 'playground.tabVersions',
        icon: ClawMascotOutline
    },
    {
        id: CLAW_DETAIL_TABS.DIAGNOSTICS,
        label: 'playground.tabDiagnostics',
        icon: PulseIcon
    },
    {
        id: CLAW_DETAIL_TABS.SETTINGS,
        label: 'playground.tabSettings',
        icon: GearSixIcon
    }
]

const CONFIGURING_DISABLED_TABS: PlaygroundDetailTab[] = [
    CLAW_DETAIL_TABS.CHANNELS,
    CLAW_DETAIL_TABS.VERSIONS,
    CLAW_DETAIL_TABS.VARIABLES,
    CLAW_DETAIL_TABS.SKILLS,
    CLAW_DETAIL_TABS.LOGS,
    CLAW_DETAIL_TABS.DIAGNOSTICS,
    CLAW_DETAIL_TABS.TERMINAL
]

const AWAITING_PAYMENT_DISABLED_TABS: PlaygroundDetailTab[] = [
    CLAW_DETAIL_TABS.CHANNELS,
    CLAW_DETAIL_TABS.VERSIONS,
    CLAW_DETAIL_TABS.VARIABLES,
    CLAW_DETAIL_TABS.SKILLS,
    CLAW_DETAIL_TABS.LOGS,
    CLAW_DETAIL_TABS.DIAGNOSTICS,
    CLAW_DETAIL_TABS.TERMINAL
]

const PlaygroundDetailPanel: FC<PlaygroundDetailPanelProps> = ({
    claw,
    plans,
    sshKeys,
    onClose,
    readOnly,
    initialTab,
    onTabChange,
    fullScreen
}): ReactNode => {
    const isConfiguring = claw.status === clawStatus.configuring
    const isAwaitingPayment = claw.status === clawStatus.awaitingPayment
    const isTabDisabled = useCallback(
        (tabId: PlaygroundDetailTab) =>
            (isConfiguring && CONFIGURING_DISABLED_TABS.includes(tabId)) ||
            (isAwaitingPayment &&
                AWAITING_PAYMENT_DISABLED_TABS.includes(tabId)),
        [isConfiguring, isAwaitingPayment]
    )
    const getDisabledTooltip = useCallback(
        (tabId: PlaygroundDetailTab) => {
            if (
                isAwaitingPayment &&
                AWAITING_PAYMENT_DISABLED_TABS.includes(tabId)
            )
                return t('playground.tabDisabledAwaitingPayment')
            return t('playground.tabDisabledConfiguring')
        },
        [isAwaitingPayment]
    )
    const activeTab = tabStateMap[claw.id] || CLAW_DETAIL_TABS.INFO
    const setActiveTab = useCallback(
        (tab: PlaygroundDetailTab) => {
            if (isTabDisabled(tab)) return
            tabStateMap[claw.id] = tab
            setRenderKey((k) => k + 1)
            if (onTabChange) onTabChange(tab)
        },
        [claw.id, onTabChange, isTabDisabled]
    )
    useEffect(() => {
        if (initialTab && initialTab !== tabStateMap[claw.id]) {
            const safeTab = isTabDisabled(initialTab)
                ? CLAW_DETAIL_TABS.INFO
                : initialTab
            tabStateMap[claw.id] = safeTab
            setRenderKey((k) => k + 1)
        }
    }, [initialTab, claw.id, isTabDisabled])
    useEffect(() => {
        if (isTabDisabled(activeTab)) {
            tabStateMap[claw.id] = CLAW_DETAIL_TABS.INFO
            setRenderKey((k) => k + 1)
            if (onTabChange) onTabChange(CLAW_DETAIL_TABS.INFO)
        }
    }, [isTabDisabled, activeTab, claw.id, onTabChange])
    const [, setRenderKey] = useState(0)
    const [settingsName, setSettingsName] = useState(claw.name)
    const [settingsNameError, setSettingsNameError] = useState('')
    const [settingsSubdomain, setSettingsSubdomain] = useState(
        claw.subdomain || ''
    )
    const [settingsSubdomainError, setSettingsSubdomainError] = useState('')
    const renameMutation = useRenameClaw()
    const subdomainMutation = useUpdateClawSubdomain()
    const { showToast } = useUIStore()

    useEffect(() => {
        setSettingsName(claw.name)
        setSettingsNameError('')
    }, [claw.name])

    useEffect(() => {
        setSettingsSubdomain(claw.subdomain || '')
        setSettingsSubdomainError('')
    }, [claw.subdomain])

    const handleSettingsNameChange = useCallback((value: string) => {
        setSettingsName(value)
        if (value.trim() && !/^[a-zA-Z0-9-]+$/.test(value)) {
            setSettingsNameError(t('dashboard.renameInvalidChars'))
        } else {
            setSettingsNameError('')
        }
    }, [])

    const handleSettingsSubdomainChange = useCallback((value: string) => {
        setSettingsSubdomain(value)
        const subdomainRegex = new RegExp(
            `^[a-z0-9]{${inputValidation.SUBDOMAIN.MIN},${inputValidation.SUBDOMAIN.MAX}}$`
        )
        if (value.trim() && !subdomainRegex.test(value)) {
            setSettingsSubdomainError(
                t('playground.subdomainInvalid', {
                    min: inputValidation.SUBDOMAIN.MIN,
                    max: inputValidation.SUBDOMAIN.MAX
                })
            )
        } else {
            setSettingsSubdomainError('')
        }
    }, [])

    const nameHasChanges = settingsName.trim() !== claw.name
    const subdomainHasChanges =
        settingsSubdomain.trim() !== (claw.subdomain || '')
    const settingsHasChanges = nameHasChanges || subdomainHasChanges

    const handleSettingsSave = useCallback(() => {
        const trimmedName = settingsName.trim()
        const trimmedSubdomain = settingsSubdomain.trim()

        if (nameHasChanges && trimmedName && trimmedName !== claw.name) {
            if (!/^[a-zA-Z0-9-]+$/.test(trimmedName)) {
                setSettingsNameError(t('dashboard.renameInvalidChars'))
                return
            }
            renameMutation.mutate(
                { id: claw.id, name: trimmedName },
                {
                    onSuccess: () => {
                        showToast(
                            t('dashboard.renameSuccess'),
                            TOAST_TYPE.SUCCESS
                        )
                    },
                    onError: () => {
                        showToast(t('dashboard.renameFailed'), TOAST_TYPE.ERROR)
                    }
                }
            )
        }

        if (
            subdomainHasChanges &&
            trimmedSubdomain &&
            trimmedSubdomain !== (claw.subdomain || '')
        ) {
            const subdomainRegex = new RegExp(
                `^[a-z0-9]{${inputValidation.SUBDOMAIN.MIN},${inputValidation.SUBDOMAIN.MAX}}$`
            )
            if (!subdomainRegex.test(trimmedSubdomain)) {
                setSettingsSubdomainError(
                    t('playground.subdomainInvalid', {
                        min: inputValidation.SUBDOMAIN.MIN,
                        max: inputValidation.SUBDOMAIN.MAX
                    })
                )
                return
            }
            subdomainMutation.mutate(
                { id: claw.id, subdomain: trimmedSubdomain },
                {
                    onSuccess: () => {
                        showToast(
                            t('playground.subdomainUpdated'),
                            TOAST_TYPE.SUCCESS
                        )
                    },
                    onError: (err) => {
                        const raw = err instanceof Error ? err.message : ''
                        const message = raw.includes('already in use')
                            ? t('playground.subdomainInUse')
                            : t('playground.subdomainUpdateFailed')
                        showToast(message, TOAST_TYPE.ERROR)
                    }
                }
            )
        }
    }, [
        settingsName,
        settingsSubdomain,
        claw.name,
        claw.subdomain,
        claw.id,
        nameHasChanges,
        subdomainHasChanges,
        renameMutation,
        subdomainMutation,
        showToast
    ])

    const isInfoTab = activeTab === 'info'
    const queryClient = useQueryClient()
    const versionQuery = useClawVersion(
        claw.id,
        isInfoTab &&
            !readOnly &&
            !!claw.ip &&
            !isConfiguring &&
            !isAwaitingPayment
    )
    useEffect(() => {
        if (
            isInfoTab &&
            !readOnly &&
            claw.ip &&
            !isConfiguring &&
            !isAwaitingPayment &&
            queryClient.getQueryData([...CLAW_VERSION_QUERY_KEY, claw.id])
        ) {
            queryClient.resetQueries({
                queryKey: [...CLAW_VERSION_QUERY_KEY, claw.id]
            })
        }
    }, [
        isInfoTab,
        readOnly,
        claw.ip,
        claw.id,
        queryClient,
        isConfiguring,
        isAwaitingPayment
    ])
    const showVersion =
        !isConfiguring && !isAwaitingPayment && (readOnly || !!claw.ip)
    const versionLoading = !readOnly && versionQuery.isLoading
    const versionDisplay = useMemo(() => {
        if (readOnly) return OPENCLAW_VERSION
        if (versionQuery.isLoading) return null
        if (versionQuery.isError || !versionQuery.data) return null
        if (versionQuery.data.version === 'unknown') return null
        const raw = versionQuery.data.version
        return raw.replace(/\s*\([a-f0-9]+\)\s*$/, '')
    }, [
        readOnly,
        versionQuery.isLoading,
        versionQuery.isError,
        versionQuery.data
    ])

    const Wrapper = fullScreen ? 'div' : motion.div
    const wrapperProps = fullScreen
        ? { className: 'flex h-full w-full flex-col overflow-hidden' }
        : {
              initial: { x: '100%' },
              animate: { x: 0 },
              exit: { x: '100%' },
              transition: { type: 'tween', duration: 0.2 },
              className:
                  'fixed inset-0 z-40 overflow-hidden md:relative md:inset-auto md:z-auto md:h-full md:w-[380px] md:shrink-0'
          }

    return (
        <Wrapper {...(wrapperProps as Record<string, unknown>)}>
            <div
                className={`flex h-full w-full flex-col ${fullScreen ? 'bg-background' : 'bg-background md:border-border md:bg-background/95 md:border-l md:backdrop-blur-xl'}`}
            >
                <div className='border-border flex items-center justify-between border-b px-5 py-2.5'>
                    <div className='flex items-center gap-2.5'>
                        <ClawAvatar />
                        <div className='space-y-px'>
                            <h3 className='text-foreground text-sm font-semibold leading-tight'>
                                {claw.name.length >
                                TRUNCATE_LENGTHS.PANEL_NAME ? (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span>
                                                {claw.name.slice(
                                                    0,
                                                    TRUNCATE_LENGTHS.PANEL_NAME
                                                )}
                                                ...
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {claw.name}
                                        </TooltipContent>
                                    </Tooltip>
                                ) : (
                                    <span>{claw.name}</span>
                                )}
                            </h3>
                            {claw.status !== clawStatus.configuring &&
                                claw.status !== clawStatus.awaitingPayment &&
                                claw.provider !== clawProvider.local && (
                                    <a
                                        href={`https://${claw.subdomain || generateSlug(claw.id)}.${getBaseDomain()}${claw.gatewayToken ? `/?token=${claw.gatewayToken}` : ''}`}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='text-muted-foreground hover:text-foreground/80 flex items-center gap-1 truncate text-xs leading-tight transition-colors'
                                    >
                                        <ArrowSquareOutIcon className='h-3 w-3 shrink-0' />
                                        {claw.subdomain ||
                                            generateSlug(claw.id)}
                                        .{getBaseDomain()}
                                    </a>
                                )}
                            {claw.provider === clawProvider.local &&
                                claw.subdomain && (
                                    <button
                                        type='button'
                                        onClick={() => {
                                            const url = `http://127.0.0.1:${claw.port}${claw.gatewayToken ? `/?token=${claw.gatewayToken}` : ''}`
                                            const eApi = (
                                                window as unknown as ElectronWindow
                                            ).electronAPI
                                            if (eApi?.openExternal) {
                                                eApi.openExternal(url)
                                            } else {
                                                window.open(url, '_blank')
                                            }
                                        }}
                                        className='text-muted-foreground hover:text-foreground/80 block truncate text-xs leading-tight transition-colors'
                                    >
                                        {claw.subdomain}.clawhost
                                    </button>
                                )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className={`text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-lg p-1.5 transition-colors ${fullScreen ? 'md:hidden' : ''}`}
                    >
                        <XIcon className='h-4 w-4' weight='bold' />
                    </button>
                </div>

                <div
                    className={`border-border flex border-b ${fullScreen ? '' : 'overflow-x-auto'}`}
                >
                    {tabs.map((tab) => {
                        const disabled = isTabDisabled(tab.id)
                        const tabButton = (
                            <button
                                key={tab.id}
                                onClick={() =>
                                    !disabled && setActiveTab(tab.id)
                                }
                                disabled={disabled}
                                className={`flex items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${fullScreen ? 'flex-1' : 'shrink-0'} ${
                                    disabled
                                        ? 'text-muted-foreground/40 cursor-not-allowed border-transparent'
                                        : activeTab === tab.id
                                          ? 'text-foreground border-[#ef5350]'
                                          : 'text-muted-foreground hover:text-foreground/80 border-transparent'
                                }`}
                            >
                                <tab.icon className='h-3.5 w-3.5' />
                                {t(tab.label as TranslationKey)}
                            </button>
                        )
                        if (disabled) {
                            return (
                                <Tooltip key={tab.id}>
                                    <TooltipTrigger asChild>
                                        {tabButton}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {getDisabledTooltip(tab.id)}
                                    </TooltipContent>
                                </Tooltip>
                            )
                        }
                        return tabButton
                    })}
                </div>

                <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
                    {activeTab === 'info' && (
                        <PlaygroundDetailInfoTab
                            claw={claw}
                            plans={plans}
                            sshKeys={sshKeys}
                            fullScreen={fullScreen}
                            showVersion={showVersion}
                            versionLoading={versionLoading}
                            versionDisplay={versionDisplay}
                        />
                    )}

                    {activeTab === 'logs' && (
                        <ClawLogsContent
                            clawId={claw.id}
                            enabled
                            embedded
                            mockLogs={
                                readOnly
                                    ? `2026-02-14T10:23:41Z ${t('playground.mockLogStarting')}\n2026-02-14T10:23:42Z ${t('playground.mockLogLoadingModel')}\n2026-02-14T10:23:43Z ${t('playground.mockLogAgentReady')}\n2026-02-14T10:23:44Z ${t('playground.mockLogConnected')}\n2026-02-14T10:24:01Z ${t('playground.mockLogRequestReceived')}\n2026-02-14T10:24:03Z ${t('playground.mockLogResponseSent1')}\n2026-02-14T10:25:12Z ${t('playground.mockLogRequestReceived')}\n2026-02-14T10:25:14Z ${t('playground.mockLogResponseSent2')}\n2026-02-14T10:26:30Z ${t('playground.mockLogHealthCheck')}`
                                    : undefined
                            }
                        />
                    )}

                    {activeTab === 'diagnostics' && (
                        <div className='h-full overflow-y-auto p-5'>
                            <ClawDiagnosticsContent
                                clawId={claw.id}
                                enabled
                                mockData={
                                    readOnly
                                        ? {
                                              service:
                                                  '● openclaw.service - OpenClaw Agent\n   Loaded: loaded (/etc/systemd/system/openclaw.service; enabled)\n   Active: active (running) since Fri 2026-02-14 10:23:41 UTC\n Main PID: 1847 (node)\n    Tasks: 11 (limit: 4915)\n   Memory: 128.4M\n      CPU: 2.341s\n   CGroup: /system.slice/openclaw.service\n           └─1847 node /opt/openclaw/server.js',
                                              port: 'tcp  0  0 0.0.0.0:3000  0.0.0.0:*  LISTEN  1847/node',
                                              memory: 'Mem: 1987Mi total, 128Mi used, 1640Mi free, 219Mi buff/cache\nSwap: 0B total, 0B used, 0B free'
                                          }
                                        : undefined
                                }
                            />
                        </div>
                    )}

                    {activeTab === 'terminal' && (
                        <ClawTerminalContent
                            clawId={claw.id}
                            enabled={activeTab === 'terminal'}
                        />
                    )}

                    {activeTab === 'skills' && (
                        <PlaygroundSkillsContent
                            clawId={claw.id}
                            onGoToVersions={() =>
                                setActiveTab(CLAW_DETAIL_TABS.VERSIONS)
                            }
                        />
                    )}

                    {activeTab === 'versions' && (
                        <PlaygroundVersionsContent clawId={claw.id} />
                    )}

                    {activeTab === 'channels' && (
                        <PlaygroundChannelsContent
                            clawId={claw.id}
                            onGoToVersions={() =>
                                setActiveTab(CLAW_DETAIL_TABS.VERSIONS)
                            }
                        />
                    )}

                    {activeTab === 'variables' && (
                        <PlaygroundVariablesContent
                            clawId={claw.id}
                            mockEnvVars={
                                readOnly
                                    ? {
                                          ANTHROPIC_API_KEY:
                                              'sk-ant-api03-••••••••',
                                          OPENAI_API_KEY: 'sk-proj-••••••••'
                                      }
                                    : undefined
                            }
                        />
                    )}

                    {activeTab === 'settings' && (
                        <PlaygroundDetailSettingsTab
                            settingsName={settingsName}
                            settingsNameError={settingsNameError}
                            settingsSubdomain={settingsSubdomain}
                            settingsSubdomainError={settingsSubdomainError}
                            settingsHasChanges={settingsHasChanges}
                            renamePending={renameMutation.isPending}
                            subdomainPending={subdomainMutation.isPending}
                            onNameChange={handleSettingsNameChange}
                            onSubdomainChange={handleSettingsSubdomainChange}
                            onSave={handleSettingsSave}
                        />
                    )}
                </div>
            </div>
        </Wrapper>
    )
}

export default PlaygroundDetailPanel