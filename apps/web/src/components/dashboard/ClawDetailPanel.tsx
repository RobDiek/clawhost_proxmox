import type { FC, ReactNode } from 'react'
import type { ClawDetailPanelProps } from '@/ts/Interfaces'
import type { ClawDetailTab } from '@/ts/Types'

import { useCallback, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { clawStatus, OPENCLAW_VERSION } from '@openclaw/shared'
import { CLAW_DETAIL_TABS } from '@/lib/constants'
import {
    CONFIGURING_DISABLED_TABS,
    AWAITING_PAYMENT_DISABLED_TABS
} from '@/lib/clawDetailTabs'
import {
    ClawLogsContent,
    ClawTerminalContent,
    ClawConfigContent,
    ClawVersionsContent,
    ClawMonitorContent,
    ClawVolumesContent,
    ClawPreviewContent,
    ClawDetailInfoTab,
    ClawDetailSettingsTab,
    ClawDetailHeader,
    ClawDetailTabBar
} from '@/components/dashboard'
import { useQueryClient } from '@tanstack/react-query'
import {
    useClawVersion,
    CLAW_VERSION_QUERY_KEY,
    useClawSettingsForm
} from '@/hooks'
import { useClawDetailTabStore } from '@/lib/store'

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
    const isConfiguring = claw.status === clawStatus.configuring
    const isAwaitingPayment = claw.status === clawStatus.awaitingPayment
    const isTabDisabled = useCallback(
        (tabId: ClawDetailTab) =>
            (isConfiguring && CONFIGURING_DISABLED_TABS.includes(tabId)) ||
            (isAwaitingPayment &&
                AWAITING_PAYMENT_DISABLED_TABS.includes(tabId)),
        [isConfiguring, isAwaitingPayment]
    )
    const getDisabledTooltip = useCallback(
        (tabId: ClawDetailTab) => {
            if (
                isAwaitingPayment &&
                AWAITING_PAYMENT_DISABLED_TABS.includes(tabId)
            )
                return t('clawDetail.tabDisabledAwaitingPayment')
            return t('clawDetail.tabDisabledConfiguring')
        },
        [isAwaitingPayment]
    )
    const tabStateMap = useClawDetailTabStore((s) => s.tabStateMap)
    const setTab = useClawDetailTabStore((s) => s.setTab)
    const activeTab = tabStateMap[claw.id] || CLAW_DETAIL_TABS.PREVIEW
    const setActiveTab = useCallback(
        (tab: ClawDetailTab) => {
            if (isTabDisabled(tab)) return
            setTab(claw.id, tab)
            if (onTabChange) onTabChange(tab)
        },
        [claw.id, onTabChange, isTabDisabled, setTab]
    )
    useEffect(() => {
        if (initialTab && initialTab !== tabStateMap[claw.id]) {
            const safeTab = isTabDisabled(initialTab)
                ? CLAW_DETAIL_TABS.PREVIEW
                : initialTab
            setTab(claw.id, safeTab)
        }
    }, [initialTab, claw.id, isTabDisabled, tabStateMap, setTab])
    useEffect(() => {
        if (isTabDisabled(activeTab)) {
            setTab(claw.id, CLAW_DETAIL_TABS.PREVIEW)
            if (onTabChange) onTabChange(CLAW_DETAIL_TABS.PREVIEW)
        }
    }, [isTabDisabled, activeTab, claw.id, onTabChange, setTab])

    const {
        settingsName,
        settingsNameError,
        settingsSubdomain,
        settingsSubdomainError,
        settingsHasChanges,
        renamePending,
        subdomainPending,
        handleSettingsNameChange,
        handleSettingsSubdomainChange,
        handleSettingsSave
    } = useClawSettingsForm(claw)

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
        return versionQuery.data.version
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
                <ClawDetailHeader
                    claw={claw}
                    onClose={onClose}
                    fullScreen={fullScreen}
                />

                <ClawDetailTabBar
                    activeTab={activeTab}
                    fullScreen={fullScreen}
                    isTabDisabled={isTabDisabled}
                    getDisabledTooltip={getDisabledTooltip}
                    setActiveTab={setActiveTab}
                />

                <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
                    {activeTab === 'preview' && (
                        <ClawPreviewContent claw={claw} />
                    )}

                    {activeTab === 'info' && (
                        <ClawDetailInfoTab
                            claw={claw}
                            plans={plans}
                            sshKeys={sshKeys}
                            fullScreen={fullScreen}
                            showVersion={showVersion}
                            versionLoading={versionLoading}
                            versionDisplay={versionDisplay}
                            isOutdated={
                                !!versionDisplay &&
                                versionDisplay !== OPENCLAW_VERSION &&
                                !versionLoading
                            }
                            onGoToVersions={() =>
                                setTab(claw.id, CLAW_DETAIL_TABS.VERSIONS)
                            }
                        />
                    )}

                    {activeTab === 'logs' && (
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

                    {activeTab === 'terminal' && (
                        <ClawTerminalContent
                            clawId={claw.id}
                            enabled={activeTab === 'terminal'}
                        />
                    )}

                    {activeTab === 'versions' && (
                        <ClawVersionsContent clawId={claw.id} />
                    )}

                    {activeTab === 'files' && (
                        <ClawConfigContent clawId={claw.id} />
                    )}

                    {activeTab === 'monitor' && (
                        <ClawMonitorContent clawId={claw.id} />
                    )}

                    {activeTab === 'volumes' && (
                        <ClawVolumesContent
                            volumes={claw.volumes || []}
                        />
                    )}

                    {activeTab === 'settings' && (
                        <ClawDetailSettingsTab
                            clawId={claw.id}
                            settingsName={settingsName}
                            settingsNameError={settingsNameError}
                            settingsSubdomain={settingsSubdomain}
                            settingsSubdomainError={settingsSubdomainError}
                            settingsHasChanges={settingsHasChanges}
                            renamePending={renamePending}
                            subdomainPending={subdomainPending}
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

export default ClawDetailPanel