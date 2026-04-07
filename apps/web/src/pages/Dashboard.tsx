import type { FC, ReactNode } from 'react'
import type { Claw, ElectronWindow } from '@/ts/Interfaces'

import {
    Fragment,
    lazy,
    useState,
    useEffect,
    useMemo,
    useCallback
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { userRole } from '@openclaw/shared'
import { useUIStore, usePreferencesStore, useDashboardStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { ROUTES, DASHBOARD_TABS, AGENT_DETAIL_TABS } from '@/lib'
import {
    useClaws,
    useAdminClaws,
    useSSHKeys,
    usePlans,
    useLocations,
    useVolumePricing,
    usePlanAvailability,
    useAllClawAgents,
    usePlaygroundGraph,
    useProfile,
    useNetworkStatus,
    useAppVersion,
    useLocalFooterLinks,
    useURLStateRestoration
} from '@/hooks'
import {
    AnnouncementBanner,
    ErrorState,
    NetworkStatus,
    PageTitle,
    ProductHuntBanner
} from '@/components'
import {
    CreateClawModal,
    DashboardChatView,
    DashboardHeader,
    DashboardPlaygroundView
} from '@/components/dashboard'
import { PlaygroundLoadingState } from '@/components/playground'
import { useAuth } from '@/lib/auth'

const CreateAgentModal = lazy(
    () => import('@/components/playground/CreateAgentModal')
)

const Dashboard: FC = (): ReactNode => {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const [awaitingClaw, setAwaitingClaw] = useState(
        () => searchParams.get('payment') === 'success'
    )
    const {
        selectedClawId,
        setSelectedClawId,
        selectedAgentId,
        setSelectedAgentId,
        selectedAgentClawId,
        setSelectedAgentClawId,
        chatSelectedAgent,
        setChatSelectedAgent,
        chatSettingsClawId,
        setChatSettingsClawId,
        chatAgentTab,
        setChatAgentTab,
        playgroundAgentTab,
        setPlaygroundAgentTab,
        playgroundClawTab,
        setPlaygroundClawTab,
        chatClawTab,
        setChatClawTab,
        showCreate,
        setShowCreate,
        preselectedPlanId,
        setPreselectedPlanId,
        createAgentClawId,
        setCreateAgentClawId,
        createAgentClawName,
        setCreateAgentClawName
    } = useDashboardStore()
    const { showToast } = useUIStore()
    const {
        adminMode: adminModeRaw,
        dashboardTab,
        setDashboardTab,
        openLinksWindowed
    } = usePreferencesStore()

    const [minLoadingMet, setMinLoadingMet] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => setMinLoadingMet(true), 1500)
        return () => clearTimeout(timer)
    }, [])

    const {
        user,
        loading: authLoading,
        cachedProfile,
        signOut,
        isLocal
    } = useAuth()
    const { data: profile } = useProfile({
        enabled: !!user,
        staleTime: 1000 * 60 * 5
    })
    const isOffline = useNetworkStatus()
    const isAdmin = profile?.role === userRole.admin
    const adminMode = !!isAdmin && adminModeRaw

    const [dnsSetup, setDnsSetup] = useState<boolean | null>(null)
    const [dnsLoading, setDnsLoading] = useState(false)
    const appVersion = useAppVersion(!!isLocal)
    const dropdownFooterLinks = useLocalFooterLinks(!!isLocal)

    useEffect(() => {
        if (!isLocal) return
        const api = (window as unknown as ElectronWindow).electronAPI
        if (api?.getDnsStatus) {
            api.getDnsStatus().then(setDnsSetup)
        }
    }, [isLocal])

    const handleDnsSetup = useCallback(async () => {
        const api = (window as unknown as ElectronWindow).electronAPI
        if (!api?.setupDns) return
        setDnsLoading(true)
        try {
            const success = await api.setupDns()
            if (success) {
                setDnsSetup(true)
                showToast(t('dashboard.dnsSetupSuccess'), TOAST_TYPE.SUCCESS)
            } else {
                showToast(t('dashboard.dnsSetupError'), TOAST_TYPE.ERROR)
            }
        } catch {
            showToast(t('dashboard.dnsSetupError'), TOAST_TYPE.ERROR)
        }
        setDnsLoading(false)
    }, [showToast])

    const displayName =
        profile?.name ||
        cachedProfile?.name ||
        (isLocal
            ? t('account.noNameSet')
            : user?.email || cachedProfile?.email || '')

    useURLStateRestoration({
        searchParams,
        setSearchParams,
        dashboardTab,
        setDashboardTab,
        selectedClawId,
        setSelectedClawId,
        selectedAgentId,
        setSelectedAgentId,
        selectedAgentClawId,
        setSelectedAgentClawId,
        chatSelectedAgent,
        setChatSelectedAgent,
        chatSettingsClawId,
        setChatSettingsClawId,
        chatAgentTab,
        setChatAgentTab,
        playgroundAgentTab,
        setPlaygroundAgentTab,
        playgroundClawTab,
        setPlaygroundClawTab,
        chatClawTab,
        setChatClawTab,
        setShowCreate,
        setPreselectedPlanId,
        showToast,
        awaitingClaw
    })

    const handleConfigureAgent = useCallback(
        (agentId: string, clawId: string) => {
            setDashboardTab(DASHBOARD_TABS.PLAYGROUND)
            setSelectedAgentId(agentId)
            setSelectedAgentClawId(clawId)
            setSelectedClawId(null)
            setPlaygroundAgentTab(AGENT_DETAIL_TABS.CONFIGURATION)
        },
        [setDashboardTab]
    )

    const handleCreateAgent = useCallback(
        (clawId: string, clawName: string) => {
            setCreateAgentClawId(clawId)
            setCreateAgentClawName(clawName)
        },
        []
    )

    const {
        data: claws,
        isLoading: isClawsLoading,
        isError,
        refetch
    } = useClaws()
    const {
        data: adminClaws,
        isLoading: isAdminClawsLoading,
        isError: isAdminClawsError,
        refetch: refetchAdmin
    } = useAdminClaws(adminMode)

    useEffect(() => {
        if (awaitingClaw && !isClawsLoading) {
            setAwaitingClaw(false)
        }
    }, [awaitingClaw, isClawsLoading])

    const displayedClaws = useMemo((): Claw[] => {
        if (adminMode) return adminClaws || []
        return claws || []
    }, [claws, adminMode, adminClaws])

    const { plans: hetznerPlans } = usePlans()
    const plans = [...(hetznerPlans || [])]
    const { data: locations } = useLocations()
    const { data: sshKeys } = useSSHKeys()
    const { data: volumePricing } = useVolumePricing()
    const { data: planAvailability } = usePlanAvailability()

    const activeClawsLoading = adminMode ? isAdminClawsLoading : isClawsLoading
    const activeIsError = adminMode ? isAdminClawsError : isError
    const activeRefetch = adminMode ? refetchAdmin : refetch
    const isLoading =
        authLoading || activeClawsLoading || (!awaitingClaw && !minLoadingMet)

    const agentQueries = useAllClawAgents(displayedClaws)
    const { nodes, edges } = usePlaygroundGraph(displayedClaws, agentQueries)

    const chatEmpty =
        dashboardTab === DASHBOARD_TABS.CHAT &&
        !isLoading &&
        !activeIsError &&
        displayedClaws.length === 0
    const chatHasContent =
        dashboardTab === DASHBOARD_TABS.CHAT &&
        !isLoading &&
        !activeIsError &&
        displayedClaws.length > 0
    const showFullBackground =
        dashboardTab === DASHBOARD_TABS.PLAYGROUND ||
        chatEmpty ||
        activeIsError ||
        isLoading

    const handleClawSelect = useCallback((clawId: string | null) => {
        setSelectedClawId(clawId)
    }, [])

    const handleAgentSelect = useCallback(
        (agentId: string | null, clawId: string | null) => {
            setSelectedAgentId(agentId)
            setSelectedAgentClawId(clawId)
        },
        []
    )

    const handleCreateClick = useCallback(() => {
        setShowCreate(true)
    }, [])

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className={`bg-background text-foreground fixed inset-0 flex flex-col ${showFullBackground && !isLocal ? 'playground-grid' : ''}`}
        >
            {isOffline ? (
                <NetworkStatus />
            ) : (
                <Fragment>
                    <ProductHuntBanner />
                    {!isLocal && <AnnouncementBanner />}
                </Fragment>
            )}
            {isLocal && showFullBackground && (
                <div className='playground-grid pointer-events-none fixed inset-0 opacity-50' />
            )}
            <div
                className={`playground-gradient pointer-events-none fixed inset-0 ${isLocal || chatHasContent ? 'opacity-30' : ''}`}
            />
            <PageTitle
                title={
                    adminMode ? t('dashboard.adminTitle') : t('dashboard.title')
                }
                description={
                    adminMode
                        ? t('dashboard.adminDescription')
                        : t('dashboard.description')
                }
                noIndex
            />

            <DashboardHeader
                dashboardTab={dashboardTab}
                isLocal={!!isLocal}
                isLoading={isLoading}
                displayedClaws={displayedClaws}
                displayName={displayName}
                dnsSetup={dnsSetup}
                dnsLoading={dnsLoading}
                openLinksWindowed={openLinksWindowed}
                appVersion={appVersion}
                dropdownFooterLinks={dropdownFooterLinks || []}
                onTabChange={setDashboardTab}
                onCreateClick={handleCreateClick}
                onDnsSetup={handleDnsSetup}
                onSignOut={signOut}
            />

            <div className='flex flex-1 overflow-hidden'>
                {activeIsError ? (
                    <div className='flex h-full min-w-0 flex-1 items-center justify-center'>
                        <div className='-mt-20'>
                            <ErrorState
                                title={t('errors.failedToLoadClaws')}
                                description={t(
                                    'errors.failedToLoadClawsDescription'
                                )}
                                onRetry={() => activeRefetch()}
                            />
                        </div>
                    </div>
                ) : isLoading ? (
                    <div className='flex h-full min-w-0 flex-1 items-center justify-center'>
                        <PlaygroundLoadingState />
                    </div>
                ) : dashboardTab === DASHBOARD_TABS.CHAT ? (
                    <DashboardChatView
                        displayedClaws={displayedClaws}
                        agentQueries={agentQueries}
                        plans={plans}
                        sshKeys={sshKeys || []}
                        adminMode={adminMode}
                        chatSelectedAgent={chatSelectedAgent}
                        chatSettingsClawId={chatSettingsClawId}
                        chatAgentTab={chatAgentTab}
                        chatClawTab={chatClawTab}
                        onAgentSelect={setChatSelectedAgent}
                        onConfigureAgent={handleConfigureAgent}
                        onCreateAgent={handleCreateAgent}
                        onSettingsClawChange={setChatSettingsClawId}
                        onAgentTabChange={setChatAgentTab}
                        onClawTabChange={setChatClawTab}
                        onCreateClick={handleCreateClick}
                    />
                ) : (
                    <DashboardPlaygroundView
                        displayedClaws={displayedClaws}
                        agentQueries={agentQueries}
                        adminMode={adminMode}
                        nodes={nodes}
                        edges={edges}
                        plans={plans}
                        sshKeys={sshKeys || []}
                        selectedClawId={selectedClawId}
                        selectedAgentId={selectedAgentId}
                        selectedAgentClawId={selectedAgentClawId}
                        playgroundClawTab={playgroundClawTab}
                        playgroundAgentTab={playgroundAgentTab}
                        isLoading={isLoading}
                        activeIsError={activeIsError}
                        onClawSelect={handleClawSelect}
                        onAgentSelect={handleAgentSelect}
                        onPlaygroundClawTabChange={setPlaygroundClawTab}
                        onPlaygroundAgentTabChange={setPlaygroundAgentTab}
                        onCreateClick={handleCreateClick}
                    />
                )}
            </div>

            {showCreate && !isLocal && plans.length > 0 && (
                <CreateClawModal
                    plans={plans}
                    locations={locations || []}
                    sshKeys={sshKeys || []}
                    volumePricing={volumePricing}
                    planAvailability={planAvailability}
                    preselectedPlanId={preselectedPlanId}
                    onClose={() => {
                        setShowCreate(false)
                        setPreselectedPlanId(null)
                    }}
                    onNavigateToSSHKeys={() => {
                        setShowCreate(false)
                        setPreselectedPlanId(null)
                        navigate(ROUTES.SSH_KEYS)
                    }}
                />
            )}

            {createAgentClawId && (
                <CreateAgentModal
                    clawId={createAgentClawId}
                    clawName={createAgentClawName}
                    open={!!createAgentClawId}
                    onOpenChange={(open) => {
                        if (!open) {
                            setCreateAgentClawId(null)
                            setCreateAgentClawName('')
                        }
                    }}
                />
            )}
        </motion.div>
    )
}

export default Dashboard