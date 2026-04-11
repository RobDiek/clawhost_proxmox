import type { FC, ReactNode } from 'react'
import type { ClawDetailPanelProps } from '@/ts/Interfaces'
import type { ClawDetailTab } from '@/ts/Types'

import { useCallback, useMemo, useEffect, useState } from 'react'
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
    ClawDiagnosticsContent,
    ClawTerminalContent,
    ClawConfigContent,
    ClawVersionsContent,
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
import { useClawDetailTabStore, useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { api } from '@/lib'

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
    const activeTab = tabStateMap[claw.id] || CLAW_DETAIL_TABS.INFO
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
                ? CLAW_DETAIL_TABS.INFO
                : initialTab
            setTab(claw.id, safeTab)
        }
    }, [initialTab, claw.id, isTabDisabled, tabStateMap, setTab])
    useEffect(() => {
        if (isTabDisabled(activeTab)) {
            setTab(claw.id, CLAW_DETAIL_TABS.INFO)
            if (onTabChange) onTabChange(CLAW_DETAIL_TABS.INFO)
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

    const { showToast } = useUIStore()
    const [isExporting, setIsExporting] = useState(false)
    const handleExport = useCallback(async () => {
        setIsExporting(true)
        try {
            await api.exportClaw(claw.id, `${claw.name}-export.tar.gz`)
            showToast(t('dashboard.exportSuccess'), TOAST_TYPE.SUCCESS)
        } catch {
            showToast(t('dashboard.exportFailed'), TOAST_TYPE.ERROR)
        }
        setIsExporting(false)
    }, [claw.id, claw.name, showToast])

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
                    {activeTab === 'info' && (
                        <ClawDetailInfoTab
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

                    {activeTab === 'versions' && (
                        <ClawVersionsContent clawId={claw.id} />
                    )}

                    {activeTab === 'files' && (
                        <ClawConfigContent clawId={claw.id} />
                    )}

                    {activeTab === 'settings' && (
                        <ClawDetailSettingsTab
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
                            onExport={handleExport}
                            isExporting={isExporting}
                        />
                    )}
                </div>
            </div>
        </Wrapper>
    )
}

export default ClawDetailPanel