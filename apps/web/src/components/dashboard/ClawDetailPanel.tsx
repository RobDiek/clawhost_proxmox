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
    ClawSecurityContent,
    ClawBillingContent,
    ClawServerContent,
    ClawPreviewContent,
    ClawDetailSettingsTab,
    ClawDetailHeader,
    ClawDetailTabBar,
    UpdateAvailableBanner
} from '@/components/dashboard'
import {
    useClawVersion,
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

    const versionQuery = useClawVersion(
        claw.id,
        !readOnly &&
            !!claw.ip &&
            !isConfiguring &&
            !isAwaitingPayment
    )
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
    const isOutdated =
        !!versionDisplay &&
        versionDisplay !== OPENCLAW_VERSION &&
        !versionQuery.isLoading

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
                    {isOutdated && (
                        <UpdateAvailableBanner
                            onGoToVersions={() =>
                                setTab(claw.id, CLAW_DETAIL_TABS.VERSIONS)
                            }
                        />
                    )}

                    {activeTab === CLAW_DETAIL_TABS.PREVIEW && (
                        <ClawPreviewContent claw={claw} />
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
                        <ClawTerminalContent
                            clawId={claw.id}
                            enabled={activeTab === CLAW_DETAIL_TABS.TERMINAL}
                        />
                    )}

                    {activeTab === CLAW_DETAIL_TABS.VERSIONS && (
                        <ClawVersionsContent clawId={claw.id} />
                    )}

                    {activeTab === CLAW_DETAIL_TABS.FILES && (
                        <ClawConfigContent clawId={claw.id} />
                    )}

                    {activeTab === CLAW_DETAIL_TABS.MONITOR && (
                        <ClawMonitorContent clawId={claw.id} />
                    )}

                    {activeTab === CLAW_DETAIL_TABS.VOLUMES && (
                        <ClawVolumesContent volumes={claw.volumes || []} />
                    )}

                    {activeTab === CLAW_DETAIL_TABS.SECURITY && (
                        <ClawSecurityContent claw={claw} sshKeys={sshKeys} />
                    )}

                    {activeTab === CLAW_DETAIL_TABS.BILLING && (
                        <ClawBillingContent claw={claw} plans={plans} />
                    )}

                    {activeTab === CLAW_DETAIL_TABS.SERVER && (
                        <ClawServerContent claw={claw} plans={plans} />
                    )}

                    {activeTab === CLAW_DETAIL_TABS.SETTINGS && (
                        <ClawDetailSettingsTab
                            claw={claw}
                            currentEmoji={settingsEmoji}
                            currentEmojiColor={settingsEmojiColor}
                            settingsName={settingsName}
                            settingsNameError={settingsNameError}
                            settingsSubdomain={settingsSubdomain}
                            settingsSubdomainError={settingsSubdomainError}
                            settingsHasChanges={settingsHasChanges}
                            renamePending={renamePending}
                            subdomainPending={subdomainPending}
                            emojiPending={emojiPending}
                            onNameChange={handleSettingsNameChange}
                            onSubdomainChange={handleSettingsSubdomainChange}
                            onEmojiChange={handleEmojiChange}
                            onSave={handleSettingsSave}
                        />
                    )}
                </div>
            </div>
        </Wrapper>
    )
}

export default ClawDetailPanel