import type { FC, ReactNode } from 'react'
import type { Claw, ElectronWindow } from '@/ts/Interfaces'
import type {
    DashboardTab,
    PlaygroundAgentDetailTab,
    PlaygroundDetailTab
} from '@/ts/Types'

import { Fragment, Suspense, lazy, useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { userRole } from '@openclaw/shared'
import { useUIStore, usePreferencesStore, useDashboardStore } from '@/lib/store'
import {
    ROUTES,
    DASHBOARD_TABS,
    AGENT_DETAIL_TABS,
    CLAW_DETAIL_TABS,
    fireConfetti
} from '@/lib'
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
    useLocalFooterLinks
} from '@/hooks'
import {
    AnnouncementBanner,
    BetaBadge,
    EmptyState,
    ErrorState,
    NetworkStatus,
    PageTitle,
    ActionButton,
    ClawMascot,
    LanguageSelector,
    Logo,
    ProductHuntBanner,
    ThemeToggle,
    UserDropdown
} from '@/components'
import {
    ChatCircleDotsIcon,
    CircleNotchIcon,
    GraphIcon,
    LightningIcon
} from '@phosphor-icons/react'
import { Button } from '@/components/ui'
import { CreateClawModal, LocalCreateClawModal } from '@/components/dashboard'
import { PlaygroundLoadingState } from '@/components/playground'
import { useAuth } from '@/lib/auth'

const PlaygroundCanvas = lazy(() => import('@/components/playground/PlaygroundCanvas'))
const PlaygroundDetailPanel = lazy(() => import('@/components/playground/PlaygroundDetailPanel'))
const PlaygroundAgentDetailPanel = lazy(() => import('@/components/playground/PlaygroundAgentDetailPanel'))
const CreateAgentModal = lazy(() => import('@/components/playground/CreateAgentModal'))
const ChatView = lazy(() => import('@/components/chat/ChatView'))

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
        preselectedProvider,
        setPreselectedProvider,
        createAgentClawId,
        setCreateAgentClawId,
        createAgentClawName,
        setCreateAgentClawName
    } = useDashboardStore()
    const isRestoringFromUrl = useRef(false)
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
                showToast(t('dashboard.dnsSetupSuccess'), 'success')
            } else {
                showToast(t('dashboard.dnsSetupError'), 'error')
            }
        } catch {
            showToast(t('dashboard.dnsSetupError'), 'error')
        }
        setDnsLoading(false)
    }, [showToast])

    const displayName =
        profile?.name ||
        cachedProfile?.name ||
        (isLocal
            ? t('account.noNameSet')
            : user?.email || cachedProfile?.email || '')

    useEffect(() => {
        if (awaitingClaw) {
            showToast(t('dashboard.paymentSuccess'), 'success')
            fireConfetti()
        }
    }, [])

    useEffect(() => {
        const planParam = searchParams.get('plan')
        const deployParam = searchParams.get('deploy')
        const providerParam = searchParams.get('provider')
        if (planParam) {
            setPreselectedPlanId(planParam)
            if (providerParam) setPreselectedProvider(providerParam)
            setShowCreate(true)
        } else if (deployParam) {
            setShowCreate(true)
        }
        if (planParam || deployParam || searchParams.get('payment')) {
            const preserved: Record<string, string> = {}
            const tab = searchParams.get('tab')
            const agent = searchParams.get('agent')
            const claw = searchParams.get('claw')
            const agentTab = searchParams.get('agentTab')
            const clawTab = searchParams.get('clawTab')
            const settingsClaw = searchParams.get('settingsClaw')
            if (tab) preserved.tab = tab
            if (agent) preserved.agent = agent
            if (claw) preserved.claw = claw
            if (agentTab) preserved.agentTab = agentTab
            if (clawTab) preserved.clawTab = clawTab
            if (settingsClaw) preserved.settingsClaw = settingsClaw
            setSearchParams(preserved, { replace: true })
        }
    }, [searchParams, setSearchParams])

    useEffect(() => {
        const tabParam = searchParams.get('tab') as DashboardTab | null
        const agentParam = searchParams.get('agent')
        const clawParam = searchParams.get('claw')
        const agentTabParam = searchParams.get(
            'agentTab'
        ) as PlaygroundAgentDetailTab | null
        const clawTabParam = searchParams.get(
            'clawTab'
        ) as PlaygroundDetailTab | null

        if (!tabParam && !agentParam && !clawParam) return

        isRestoringFromUrl.current = true

        if (
            tabParam === DASHBOARD_TABS.CHAT ||
            tabParam === DASHBOARD_TABS.PLAYGROUND
        ) {
            setDashboardTab(tabParam)
        }

        const effectiveTab = tabParam || dashboardTab
        const settingsClawParam = searchParams.get('settingsClaw')

        const validAgentTabs: PlaygroundAgentDetailTab[] = [
            AGENT_DETAIL_TABS.CHAT,
            AGENT_DETAIL_TABS.CHANNELS,
            AGENT_DETAIL_TABS.SKILLS,
            AGENT_DETAIL_TABS.CONFIGURATION
        ]
        const validChatAgentTabs: PlaygroundAgentDetailTab[] = [
            AGENT_DETAIL_TABS.CONFIGURATION,
            AGENT_DETAIL_TABS.CHANNELS,
            AGENT_DETAIL_TABS.SKILLS
        ]
        const validClawTabs: PlaygroundDetailTab[] = [
            CLAW_DETAIL_TABS.INFO,
            CLAW_DETAIL_TABS.CHANNELS,
            CLAW_DETAIL_TABS.TERMINAL,
            CLAW_DETAIL_TABS.VARIABLES,
            CLAW_DETAIL_TABS.LOGS,
            CLAW_DETAIL_TABS.DIAGNOSTICS,
            CLAW_DETAIL_TABS.SKILLS
        ]

        if (agentParam && clawParam) {
            if (effectiveTab === DASHBOARD_TABS.CHAT) {
                setChatSelectedAgent({
                    agentId: agentParam,
                    clawId: clawParam
                })
                if (agentTabParam) {
                    setChatAgentTab(
                        validChatAgentTabs.includes(agentTabParam)
                            ? agentTabParam
                            : AGENT_DETAIL_TABS.CONFIGURATION
                    )
                }
            } else {
                setSelectedAgentId(agentParam)
                setSelectedAgentClawId(clawParam)
                setSelectedClawId(null)
                if (agentTabParam) {
                    setPlaygroundAgentTab(
                        validAgentTabs.includes(agentTabParam)
                            ? agentTabParam
                            : AGENT_DETAIL_TABS.CHAT
                    )
                }
            }
        } else if (clawParam && effectiveTab === DASHBOARD_TABS.PLAYGROUND) {
            setSelectedClawId(clawParam)
            setSelectedAgentId(null)
            setSelectedAgentClawId(null)
            if (clawTabParam) {
                setPlaygroundClawTab(
                    validClawTabs.includes(clawTabParam)
                        ? clawTabParam
                        : CLAW_DETAIL_TABS.INFO
                )
            }
        }

        if (effectiveTab === DASHBOARD_TABS.CHAT && settingsClawParam) {
            setChatSettingsClawId(settingsClawParam)
            if (clawTabParam) {
                setChatClawTab(
                    validClawTabs.includes(clawTabParam)
                        ? clawTabParam
                        : CLAW_DETAIL_TABS.INFO
                )
            }
        }

        requestAnimationFrame(() => {
            isRestoringFromUrl.current = false
        })
    }, [])

    useEffect(() => {
        if (isRestoringFromUrl.current) return
        const params: Record<string, string> = {}
        params.tab = dashboardTab
        if (dashboardTab === DASHBOARD_TABS.CHAT) {
            if (chatSelectedAgent) {
                params.agent = chatSelectedAgent.agentId
                params.claw = chatSelectedAgent.clawId
            }
            if (chatAgentTab) {
                params.agentTab = chatAgentTab
            } else if (chatSettingsClawId) {
                params.settingsClaw = chatSettingsClawId
                if (chatClawTab) params.clawTab = chatClawTab
            }
        } else if (dashboardTab === DASHBOARD_TABS.PLAYGROUND) {
            if (selectedAgentId && selectedAgentClawId) {
                params.agent = selectedAgentId
                params.claw = selectedAgentClawId
                if (playgroundAgentTab) params.agentTab = playgroundAgentTab
            } else if (selectedClawId) {
                params.claw = selectedClawId
                if (playgroundClawTab) params.clawTab = playgroundClawTab
            }
        }
        setSearchParams(params, { replace: true })
    }, [
        dashboardTab,
        chatSelectedAgent,
        chatAgentTab,
        chatSettingsClawId,
        chatClawTab,
        selectedAgentId,
        selectedAgentClawId,
        selectedClawId,
        playgroundAgentTab,
        playgroundClawTab
    ])

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

    const graphClaws = displayedClaws
    const agentQueries = useAllClawAgents(graphClaws)
    const { nodes, edges } = usePlaygroundGraph(graphClaws, agentQueries)

    const activeClaws = adminMode ? adminClaws : claws
    const selectedClaw =
        selectedClawId && !selectedAgentId
            ? activeClaws?.find((c) => c.id === selectedClawId) || null
            : null

    const selectedAgentClaw = selectedAgentClawId
        ? activeClaws?.find((c) => c.id === selectedAgentClawId) || null
        : null

    const selectedAgentResult =
        selectedAgentId && selectedAgentClaw
            ? (() => {
                  const clawIndex = graphClaws.findIndex(
                      (c) => c.id === selectedAgentClawId
                  )
                  const query = clawIndex >= 0 ? agentQueries[clawIndex] : null
                  const agents = query?.data?.agents || []
                  const agent =
                      agents.find((a) => a.id === selectedAgentId) || null
                  return {
                      agent,
                      isOnly: agents.length <= 1
                  }
              })()
            : null

    const selectedAgent = selectedAgentResult?.agent || null
    const isSelectedAgentOnly = selectedAgentResult?.isOnly || false

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

            <div className='border-border bg-background md:bg-background/80 relative z-10 flex items-center justify-between border-b px-6 py-3 md:backdrop-blur-xl'>
                <div className='flex items-center gap-3'>
                    <Logo />
                    {(window as unknown as ElectronWindow).electronAPI
                        ?.isDesktop && <BetaBadge />}
                    <div className='border-border flex items-center rounded-lg border p-0.5'>
                        <button
                            onClick={() => setDashboardTab(DASHBOARD_TABS.CHAT)}
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${dashboardTab === DASHBOARD_TABS.CHAT ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <ChatCircleDotsIcon
                                className='h-3.5 w-3.5'
                                weight={
                                    dashboardTab === DASHBOARD_TABS.CHAT
                                        ? 'fill'
                                        : 'regular'
                                }
                            />
                            <span
                                className={
                                    dashboardTab === DASHBOARD_TABS.CHAT
                                        ? 'hidden sm:inline'
                                        : 'hidden md:inline'
                                }
                            >
                                {t('dashboard.chatTab')}
                            </span>
                        </button>
                        <button
                            onClick={() =>
                                setDashboardTab(DASHBOARD_TABS.PLAYGROUND)
                            }
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${dashboardTab === DASHBOARD_TABS.PLAYGROUND ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <GraphIcon
                                className='h-3.5 w-3.5'
                                weight={
                                    dashboardTab === DASHBOARD_TABS.PLAYGROUND
                                        ? 'fill'
                                        : 'regular'
                                }
                            />
                            <span
                                className={
                                    dashboardTab === DASHBOARD_TABS.PLAYGROUND
                                        ? 'hidden sm:inline'
                                        : 'hidden md:inline'
                                }
                            >
                                {t('dashboard.playgroundTab')}
                            </span>
                        </button>
                    </div>
                </div>

                <div className='flex items-center gap-1.5 sm:gap-3'>
                    {!isLoading &&
                        displayedClaws &&
                        displayedClaws.length > 0 && (
                            <Fragment>
                                <div className='sm:hidden'>
                                    <Button
                                        onClick={() => setShowCreate(true)}
                                        size='icon'
                                        className='border-border bg-foreground text-background hover:bg-foreground/90 h-9 w-9 border'
                                    >
                                        <LightningIcon
                                            className='h-5 w-5'
                                            weight='fill'
                                        />
                                    </Button>
                                </div>
                                <div className='hidden sm:block'>
                                    <ActionButton
                                        onClick={() => setShowCreate(true)}
                                        icon={
                                            <LightningIcon
                                                className='h-5 w-5'
                                                weight='fill'
                                            />
                                        }
                                        label={t('createClaw.title')}
                                    />
                                </div>
                            </Fragment>
                        )}
                    <div className='flex items-center gap-1.5'>
                        <LanguageSelector />
                        <ThemeToggle />
                    </div>
                    <UserDropdown
                        displayName={displayName}
                        onSignOut={signOut}
                        hideBilling={!!isLocal}
                        hideSSHKeys={!!isLocal}
                        hideSignOut={!!isLocal}
                        footerLinks={dropdownFooterLinks}
                        openLinksWindowed={
                            isLocal ? openLinksWindowed : undefined
                        }
                        appVersion={appVersion || undefined}
                    />
                </div>
            </div>

            {isLocal && dnsSetup === false && displayedClaws.length > 0 && (
                <div className='border-border bg-foreground/5 relative z-10 flex items-center justify-between border-b px-6 py-2.5'>
                    <p className='text-foreground text-xs'>
                        {t('dashboard.dnsSetupBanner')}
                    </p>
                    <button
                        onClick={handleDnsSetup}
                        disabled={dnsLoading}
                        className='flex items-center gap-1.5 rounded-md bg-[#ef5350] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#e53935] disabled:opacity-50'
                    >
                        {dnsLoading && (
                            <CircleNotchIcon className='h-3 w-3 animate-spin' />
                        )}
                        {t('dashboard.dnsSetupButton')}
                    </button>
                </div>
            )}

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
                    <Suspense fallback={<div className='flex h-full min-w-0 flex-1 items-center justify-center'><PlaygroundLoadingState /></div>}>
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className='flex h-full min-w-0 flex-1'
                    >
                        {displayedClaws.length === 0 ? (
                            <div className='flex h-full min-w-0 flex-1 items-center justify-center'>
                                <div className='-mt-20'>
                                    <EmptyState
                                        icon={
                                            <ClawMascot className='h-10 w-10' />
                                        }
                                        title={
                                            adminMode
                                                ? t('dashboard.adminNoClaws')
                                                : t('playground.noClawsYet')
                                        }
                                        description={
                                            adminMode
                                                ? t(
                                                      'dashboard.adminDescription'
                                                  )
                                                : t(
                                                      'playground.noClawsDescription'
                                                  )
                                        }
                                        actionLabel={t('nav.deployOpenClaw')}
                                        onAction={() => setShowCreate(true)}
                                    />
                                </div>
                            </div>
                        ) : (
                            <ChatView
                                claws={displayedClaws}
                                agentQueries={agentQueries}
                                plans={plans}
                                sshKeys={sshKeys || []}
                                selectedAgent={chatSelectedAgent}
                                onAgentSelect={setChatSelectedAgent}
                                onConfigureAgent={handleConfigureAgent}
                                onCreateAgent={handleCreateAgent}
                                initialSettingsClawId={chatSettingsClawId}
                                onSettingsClawChange={setChatSettingsClawId}
                                initialAgentTab={chatAgentTab || undefined}
                                onAgentTabChange={setChatAgentTab}
                                initialClawTab={chatClawTab || undefined}
                                onClawTabChange={setChatClawTab}
                            />
                        )}
                    </motion.div>
                    </Suspense>
                ) : (
                    <Suspense fallback={<div className='flex h-full min-w-0 flex-1 items-center justify-center'><PlaygroundLoadingState /></div>}>
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className='flex h-full min-w-0 flex-1'
                    >
                        <div className='relative h-full min-w-0 flex-1'>
                            <PlaygroundCanvas
                                key={adminMode ? 'admin' : 'user'}
                                initialNodes={nodes}
                                initialEdges={edges}
                                onNodeClick={(clawId) => {
                                    setSelectedClawId(clawId)
                                    setSelectedAgentId(null)
                                    setSelectedAgentClawId(null)
                                }}
                                onAgentClick={(agentId, clawId) => {
                                    setSelectedAgentId(agentId)
                                    setSelectedAgentClawId(clawId)
                                    setSelectedClawId(null)
                                }}
                                onPaneClick={() => {
                                    setSelectedClawId(null)
                                    setSelectedAgentId(null)
                                    setSelectedAgentClawId(null)
                                }}
                                panelOpen={!!selectedClaw || !!selectedAgent}
                                selectedClawId={selectedClawId}
                                selectedAgentId={selectedAgentId}
                                selectedAgentClawId={selectedAgentClawId}
                            />

                            {!isLoading &&
                                !activeIsError &&
                                (!displayedClaws ||
                                    displayedClaws.length === 0) && (
                                    <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center'>
                                        <div className='pointer-events-auto -mt-20'>
                                            <EmptyState
                                                icon={
                                                    <ClawMascot className='h-10 w-10' />
                                                }
                                                title={
                                                    adminMode
                                                        ? t(
                                                              'dashboard.adminNoClaws'
                                                          )
                                                        : t(
                                                              'playground.noClawsYet'
                                                          )
                                                }
                                                description={
                                                    adminMode
                                                        ? t(
                                                              'dashboard.adminDescription'
                                                          )
                                                        : t(
                                                              'playground.noClawsDescription'
                                                          )
                                                }
                                                actionLabel={t(
                                                    'nav.deployOpenClaw'
                                                )}
                                                onAction={() =>
                                                    setShowCreate(true)
                                                }
                                            />
                                        </div>
                                    </div>
                                )}
                        </div>

                        <AnimatePresence mode='wait'>
                            {selectedClaw && (
                                <PlaygroundDetailPanel
                                    key='detail-panel'
                                    claw={selectedClaw}
                                    plans={plans}
                                    sshKeys={sshKeys || []}
                                    onClose={() => setSelectedClawId(null)}
                                    initialTab={playgroundClawTab || undefined}
                                    onTabChange={setPlaygroundClawTab}
                                />
                            )}

                            {selectedAgent && selectedAgentClaw && (
                                <PlaygroundAgentDetailPanel
                                    key={`agent-panel-${selectedAgent.id}`}
                                    agent={selectedAgent}
                                    clawId={selectedAgentClaw.id}
                                    clawName={selectedAgentClaw.name}
                                    isOnlyAgent={isSelectedAgentOnly}
                                    gatewayToken={
                                        selectedAgentClaw.gatewayToken
                                    }
                                    subdomain={selectedAgentClaw.subdomain}
                                    initialTab={playgroundAgentTab || undefined}
                                    onTabChange={setPlaygroundAgentTab}
                                    onClose={() => {
                                        setSelectedAgentId(null)
                                        setSelectedAgentClawId(null)
                                    }}
                                    onGoToVersions={() => {
                                        setSelectedAgentId(null)
                                        setSelectedAgentClawId(null)
                                        setSelectedClawId(selectedAgentClaw.id)
                                        setPlaygroundClawTab('versions')
                                    }}
                                />
                            )}
                        </AnimatePresence>
                    </motion.div>
                    </Suspense>
                )}
            </div>

            {showCreate && isLocal && (
                <LocalCreateClawModal
                    onClose={() => {
                        setShowCreate(false)
                    }}
                />
            )}

            {showCreate && !isLocal && plans.length > 0 && (
                <CreateClawModal
                    plans={plans}
                    locations={locations || []}
                    sshKeys={sshKeys || []}
                    volumePricing={volumePricing}
                    planAvailability={planAvailability}
                    preselectedPlanId={preselectedPlanId}
                    preselectedProvider={preselectedProvider}
                    onClose={() => {
                        setShowCreate(false)
                        setPreselectedPlanId(null)
                        setPreselectedProvider(null)
                    }}
                    onNavigateToSSHKeys={() => {
                        setShowCreate(false)
                        setPreselectedPlanId(null)
                        setPreselectedProvider(null)
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