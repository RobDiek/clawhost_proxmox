import type { FC, ReactNode } from 'react'
import type { ClawDetailPanelProps } from '@/ts/Interfaces'
import type { ClawDetailTab } from '@/ts/Types'

import {
    Fragment,
    Suspense,
    lazy,
    useCallback,
    useMemo,
    useEffect
} from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { clawStatus } from '@openclaw/shared'
import { CLAW_DETAIL_TABS } from '@/lib/constants'
import {
    ClawLogsContent,
    ClawOverviewContent,
    ClawVolumesContent,
    ClawSecurityContent,
    ClawBillingContent,
    ClawServerContent,
    ClawPreviewContent,
    ClawDetailSettingsTab,
    ClawDetailHeader,
    ClawDetailTabBar,
    ClawPendingView,
    UpdateAvailableBanner,
    DemoTerminal
} from '@/components/dashboard'
import {
    useClawVersion,
    useClawSettingsForm,
    useCancelPendingClaw,
    CLAW_VERSIONS_QUERY_KEY
} from '@/hooks'
import { api } from '@/lib'
import { useClawDetailTabStore } from '@/lib/store'

const ClawTerminalContent = lazy(
    () => import('@/components/dashboard/ClawTerminalContent')
)
const ClawMonitorContent = lazy(
    () => import('@/components/dashboard/ClawMonitorContent')
)
const ClawConfigContent = lazy(
    () => import('@/components/dashboard/ClawConfigDialog/ClawConfigContent')
)
const ClawVersionsContent = lazy(
    () => import('@/components/dashboard/ClawVersionsContent')
)

const TabFallback: FC = (): ReactNode => (
    <div className='flex flex-1 items-center justify-center p-8'>
        <div className='border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent' />
    </div>
)

const ClawDetailPanel: FC<ClawDetailPanelProps> = ({
    claw,
    plans,
    sshKeys,
    onClose,
    readOnly,
    initialTab,
    onTabChange,
    fullScreen
}): ReactNode => {
    const isPending =
        claw.status === clawStatus.configuring ||
        claw.status === clawStatus.creating ||
        claw.status === clawStatus.awaitingPayment
    const cancelPending = useCancelPendingClaw()
    const tabStateMap = useClawDetailTabStore((s) => s.tabStateMap)
    const setTab = useClawDetailTabStore((s) => s.setTab)
    const activeTab = tabStateMap[claw.id] || CLAW_DETAIL_TABS.OVERVIEW
    const setActiveTab = useCallback(
        (tab: ClawDetailTab) => {
            setTab(claw.id, tab)
            if (onTabChange) onTabChange(tab)
        },
        [claw.id, onTabChange, setTab]
    )
    useEffect(() => {
        if (initialTab && initialTab !== tabStateMap[claw.id])
            setTab(claw.id, initialTab)
    }, [initialTab, claw.id, tabStateMap, setTab])

    const {
        settingsEmoji,
        settingsEmojiColor,
        settingsName,
        settingsNameError,
        settingsSubdomain,
        settingsSubdomainError,
        settingsHasChanges,
        renamePending,
        subdomainPending,
        emojiPending,
        handleEmojiChange,
        handleSettingsNameChange,
        handleSettingsSubdomainChange,
        handleSettingsSave
    } = useClawSettingsForm(claw)

    const canQuery = !readOnly && !!claw.ip && !isPending
    const versionQuery = useClawVersion(claw.id, canQuery)
    const versionsQuery = useQuery({
        queryKey: [...CLAW_VERSIONS_QUERY_KEY, claw.id],
        queryFn: () => api.getClawVersions(claw.id),
        enabled: canQuery,
        staleTime: 1000 * 60 * 30,
        retry: 1
    })
    const latestVersion = versionsQuery.data?.latestVersion ?? null
    const versionDisplay = useMemo(() => {
        if (versionQuery.isLoading) return null
        if (versionQuery.isError || !versionQuery.data) return null
        if (versionQuery.data.version === 'unknown') return null
        return versionQuery.data.version
    }, [versionQuery.isLoading, versionQuery.isError, versionQuery.data])
    const isOutdated =
        !!versionDisplay && !!latestVersion && versionDisplay !== latestVersion

    const handleCancelPending = useCallback(() => {
        cancelPending.mutate(claw.id.replace('pending-', ''))
        onClose()
    }, [cancelPending, claw.id, onClose])

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
                <ClawDetailHeader
                    claw={claw}
                    onClose={onClose}
                    fullScreen={fullScreen}
                    versionDisplay={versionDisplay}
                    readOnly={readOnly}
                />

                {isPending ? (
                    <ClawPendingView
                        status={claw.status}
                        checkoutUrl={claw.checkoutUrl}
                        onCancel={
                            claw.status === clawStatus.awaitingPayment
                                ? handleCancelPending
                                : undefined
                        }
                        cancelPending={cancelPending.isPending}
                    />
                ) : (
                    <Fragment>
                        <ClawDetailTabBar
                            activeTab={activeTab}
                            fullScreen={fullScreen}
                            isTabDisabled={() => false}
                            getDisabledTooltip={() => ''}
                            setActiveTab={setActiveTab}
                        />

                        <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
                            {isOutdated &&
                                latestVersion &&
                                activeTab !== CLAW_DETAIL_TABS.VERSIONS && (
                                    <UpdateAvailableBanner
                                        latestVersion={latestVersion}
                                        onGoToVersions={() =>
                                            setTab(
                                                claw.id,
                                                CLAW_DETAIL_TABS.VERSIONS
                                            )
                                        }
                                    />
                                )}

                            {activeTab === CLAW_DETAIL_TABS.OVERVIEW && (
                                <ClawOverviewContent
                                    clawId={claw.id}
                                    readOnly={readOnly}
                                />
                            )}

                            {activeTab === CLAW_DETAIL_TABS.PREVIEW && (
                                <ClawPreviewContent claw={claw} readOnly={readOnly} />
                            )}

                            {activeTab === CLAW_DETAIL_TABS.LOGS && (
                                <ClawLogsContent
                                    clawId={claw.id}
                                    enabled
                                    embedded
                                    mockLogs={
                                        readOnly
                                            ? t('clawDetail.mockLogsContent', {
                                                  starting: t(
                                                      'clawDetail.mockLogStarting'
                                                  ),
                                                  loadingModel: t(
                                                      'clawDetail.mockLogLoadingModel'
                                                  ),
                                                  agentReady: t(
                                                      'clawDetail.mockLogAgentReady'
                                                  ),
                                                  connected: t(
                                                      'clawDetail.mockLogConnected'
                                                  ),
                                                  requestReceived: t(
                                                      'clawDetail.mockLogRequestReceived'
                                                  ),
                                                  responseSent1: t(
                                                      'clawDetail.mockLogResponseSent1'
                                                  ),
                                                  responseSent2: t(
                                                      'clawDetail.mockLogResponseSent2'
                                                  ),
                                                  healthCheck: t(
                                                      'clawDetail.mockLogHealthCheck'
                                                  )
                                              })
                                            : undefined
                                    }
                                />
                            )}

                            {activeTab === CLAW_DETAIL_TABS.TERMINAL && (
                                readOnly ? (
                                    <DemoTerminal />
                                ) : (
                                    <Suspense fallback={<TabFallback />}>
                                        <ClawTerminalContent
                                            clawId={claw.id}
                                            enabled={
                                                activeTab ===
                                                CLAW_DETAIL_TABS.TERMINAL
                                            }
                                        />
                                    </Suspense>
                                )
                            )}

                            {activeTab === CLAW_DETAIL_TABS.VERSIONS && (
                                <Suspense fallback={<TabFallback />}>
                                    <ClawVersionsContent clawId={claw.id} readOnly={readOnly} />
                                </Suspense>
                            )}

                            {activeTab === CLAW_DETAIL_TABS.FILES && (
                                <Suspense fallback={<TabFallback />}>
                                    <ClawConfigContent clawId={claw.id} readOnly={readOnly} />
                                </Suspense>
                            )}

                            {activeTab === CLAW_DETAIL_TABS.MONITOR && (
                                <Suspense fallback={<TabFallback />}>
                                    <ClawMonitorContent clawId={claw.id} readOnly={readOnly} />
                                </Suspense>
                            )}

                            {activeTab === CLAW_DETAIL_TABS.VOLUMES && (
                                <ClawVolumesContent
                                    volumes={claw.volumes || []}
                                    readOnly={readOnly}
                                />
                            )}

                            {activeTab === CLAW_DETAIL_TABS.SECURITY && (
                                <ClawSecurityContent
                                    claw={claw}
                                    sshKeys={sshKeys}
                                    readOnly={readOnly}
                                />
                            )}

                            {activeTab === CLAW_DETAIL_TABS.BILLING && (
                                <ClawBillingContent claw={claw} plans={plans} readOnly={readOnly} />
                            )}

                            {activeTab === CLAW_DETAIL_TABS.SERVER && (
                                <ClawServerContent claw={claw} plans={plans} readOnly={readOnly} />
                            )}

                            {activeTab === CLAW_DETAIL_TABS.SETTINGS && (
                                <ClawDetailSettingsTab
                                    claw={claw}
                                    currentEmoji={settingsEmoji}
                                    currentEmojiColor={settingsEmojiColor}
                                    settingsName={settingsName}
                                    settingsNameError={settingsNameError}
                                    settingsSubdomain={settingsSubdomain}
                                    settingsSubdomainError={
                                        settingsSubdomainError
                                    }
                                    settingsHasChanges={settingsHasChanges}
                                    renamePending={renamePending}
                                    subdomainPending={subdomainPending}
                                    emojiPending={emojiPending}
                                    onNameChange={handleSettingsNameChange}
                                    onSubdomainChange={
                                        handleSettingsSubdomainChange
                                    }
                                    onEmojiChange={handleEmojiChange}
                                    onSave={handleSettingsSave}
                                    readOnly={readOnly}
                                />
                            )}
                        </div>
                    </Fragment>
                )}
            </div>
        </Wrapper>
    )
}

export default ClawDetailPanel