import type { FC, ReactNode } from 'react'
import type {
    ChatViewProps,
    ChatSelectedAgent,
    ClawWithAgents
} from '@/ts/Interfaces'
import type { GatewayConnectionState } from '@/ts/Types'

import {
    Fragment,
    useState,
    useEffect,
    useMemo,
    useCallback,
    useRef
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { clawStatus, userRole } from '@openclaw/shared'
import { t } from '@openclaw/i18n'
import {
    ListIcon,
    XIcon,
    GearSixIcon,
    ArrowSquareOutIcon,
    TreeStructureIcon,
    ListBulletsIcon
} from '@phosphor-icons/react'
import { usePreferencesStore } from '@/lib/store'
import {
    CHAT_SIDEBAR_VIEW_MODE,
    GATEWAY_CONNECTION_STATE
} from '@/lib/constants'
import { ClawAvatar } from '@/components/shared'
import { getBaseDomain } from '@/lib'
import { generateSlug } from '@/lib/claw-utils'
import { useProfile, useClawCardActions } from '@/hooks'
import ChatSidebar from '@/components/chat/ChatSidebar'
import ChatEmptyState from '@/components/chat/ChatEmptyState'
import { ChatSkeleton } from '@/components/playground/AgentChat'
import {
    ClawCardDropdownMenu,
    ClawCardDialogsBundle
} from '@/components/dashboard'
import {
    AgentChat,
    PlaygroundDetailPanel,
    PlaygroundAgentDetailPanel
} from '@/components/playground'

const ChatView: FC<ChatViewProps> = ({
    claws,
    agentQueries,
    plans,
    sshKeys,
    selectedAgent,
    onAgentSelect,
    onConfigureAgent: _onConfigureAgent,
    onCreateAgent,
    initialSettingsClawId,
    onSettingsClawChange,
    initialAgentTab,
    onAgentTabChange,
    initialClawTab,
    onClawTabChange
}): ReactNode => {
    const chatSidebarView = usePreferencesStore((s) => s.chatSidebarView)
    const setChatSidebarView = usePreferencesStore((s) => s.setChatSidebarView)

    const [settingsClawId, setSettingsClawId] = useState<string | null>(
        initialSettingsClawId || null
    )
    const [configAgent, setConfigAgent] = useState<ChatSelectedAgent | null>(
        null
    )
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const [activeConnectionState, setActiveConnectionState] =
        useState<GatewayConnectionState>(GATEWAY_CONNECTION_STATE.DISCONNECTED)
    const isInitialMount = useRef(true)

    const { data: profile } = useProfile({ enabled: true })

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false
            return
        }
        onSettingsClawChange?.(settingsClawId)
    }, [settingsClawId])

    const clawsWithAgents = useMemo((): ClawWithAgents[] => {
        return claws.map((claw, index) => {
            const query = agentQueries[index]
            const isReachable =
                (claw.status === clawStatus.running ||
                    claw.status === clawStatus.unreachable) &&
                !!claw.ip
            const agents = isReachable ? query?.data?.agents || [] : []
            const isLoading = isReachable && (query?.isLoading ?? true)
            return { claw, agents, isLoading, isReachable }
        })
    }, [claws, agentQueries])

    const activeClaw = useMemo(() => {
        if (!selectedAgent) return null
        return claws.find((c) => c.id === selectedAgent.clawId) || null
    }, [claws, selectedAgent])

    const activeAgent = useMemo(() => {
        if (!selectedAgent || !activeClaw) return null
        const clawIndex = claws.findIndex((c) => c.id === selectedAgent.clawId)
        const query = clawIndex >= 0 ? agentQueries[clawIndex] : null
        const agents = query?.data?.agents || []
        return agents.find((a) => a.id === selectedAgent.agentId) || null
    }, [selectedAgent, activeClaw, claws, agentQueries])

    const selectedAgentIsLoading = useMemo(() => {
        if (!selectedAgent) return false
        const clawIndex = claws.findIndex((c) => c.id === selectedAgent.clawId)
        const query = clawIndex >= 0 ? agentQueries[clawIndex] : null
        return query?.isLoading ?? false
    }, [selectedAgent, claws, agentQueries])

    const settingsClaw = useMemo(() => {
        if (!settingsClawId) return null
        return claws.find((c) => c.id === settingsClawId) || null
    }, [claws, settingsClawId])

    const configClaw = useMemo(() => {
        if (!configAgent) return null
        return claws.find((c) => c.id === configAgent.clawId) || null
    }, [claws, configAgent])

    const configAgentData = useMemo(() => {
        if (!configAgent || !configClaw) return null
        const clawIndex = claws.findIndex((c) => c.id === configAgent.clawId)
        const query = clawIndex >= 0 ? agentQueries[clawIndex] : null
        const agents = query?.data?.agents || []
        return agents.find((a) => a.id === configAgent.agentId) || null
    }, [configAgent, configClaw, claws, agentQueries])

    const configIsOnlyAgent = useMemo(() => {
        if (!configAgent) return false
        const clawIndex = claws.findIndex((c) => c.id === configAgent.clawId)
        const query = clawIndex >= 0 ? agentQueries[clawIndex] : null
        return (query?.data?.agents || []).length === 1
    }, [configAgent, claws, agentQueries])

    const closeMobileSidebar = useCallback(() => {
        setMobileSidebarOpen(false)
    }, [])

    const handleAgentSelect = useCallback(
        (selection: ChatSelectedAgent) => {
            const isAlreadySelected =
                selectedAgent?.agentId === selection.agentId &&
                selectedAgent?.clawId === selection.clawId
            if (isAlreadySelected) {
                onAgentSelect(null)
                setMobileSidebarOpen(false)
                return
            }
            setSettingsClawId(null)
            onAgentSelect(selection)
            setMobileSidebarOpen(false)
        },
        [onAgentSelect, selectedAgent]
    )

    const handleConfigureAgent = useCallback(
        (agentId: string, clawId: string) => {
            if (
                configAgent?.agentId === agentId &&
                configAgent?.clawId === clawId
            ) {
                setConfigAgent(null)
                return
            }
            setSettingsClawId(null)
            onAgentSelect({ agentId, clawId })
            setConfigAgent({ agentId, clawId })
        },
        [configAgent, onAgentSelect]
    )

    const handleOpenClawSettings = useCallback(
        (clawId: string) => {
            if (settingsClawId === clawId && !selectedAgent) {
                setSettingsClawId(null)
                setMobileSidebarOpen(false)
                return
            }
            setSettingsClawId(clawId)
            onAgentSelect(null)
            setMobileSidebarOpen(false)
        },
        [onAgentSelect, settingsClawId, selectedAgent]
    )

    const handleCloseClawSettings = useCallback(() => {
        setSettingsClawId(null)
    }, [])

    const handleConnectionStateChange = useCallback(
        (state: GatewayConnectionState) => {
            setActiveConnectionState(state)
        },
        []
    )

    const mobileLabel = useMemo(() => {
        if (activeAgent) return activeAgent.name
        if (settingsClaw) return settingsClaw.name
        return t('nav.claws')
    }, [activeAgent, settingsClaw])

    const headerDropdownClaw = activeClaw

    const {
        actions: headerClawActions,
        isMutating,
        dialogsProps
    } = useClawCardActions({ claw: headerDropdownClaw })

    return (
        <div className='relative flex h-full w-full overflow-hidden'>
            <div className='playground-grid pointer-events-none absolute inset-0 opacity-50' />
            <div className='hidden md:block'>
                <ChatSidebar
                    clawsWithAgents={clawsWithAgents}
                    selectedAgent={selectedAgent}
                    configAgent={configAgent}
                    selectedClawId={settingsClawId}
                    activeConnectionState={activeConnectionState}
                    onAgentSelect={handleAgentSelect}
                    onConfigureAgent={handleConfigureAgent}
                    onCreateAgent={onCreateAgent}
                    onOpenClawSettings={handleOpenClawSettings}
                />
            </div>
            <div className='max-md:bg-background flex min-w-0 flex-1 flex-col max-md:relative max-md:z-10'>
                {!(settingsClaw && !selectedAgent) && (
                    <div className='border-border bg-background flex items-center gap-2 border-b px-4 py-2.5 md:hidden'>
                        <button
                            onClick={() =>
                                setMobileSidebarOpen(!mobileSidebarOpen)
                            }
                            className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-lg p-1.5 transition-colors'
                            aria-label={t('chat.openSidebar')}
                        >
                            {mobileSidebarOpen ? (
                                <XIcon className='h-5 w-5' weight='bold' />
                            ) : (
                                <ListIcon className='h-5 w-5' weight='bold' />
                            )}
                        </button>
                        <span className='text-foreground/80 min-w-0 flex-1 truncate text-sm font-medium'>
                            {mobileLabel}
                        </span>
                        {mobileSidebarOpen && <div className='flex-1' />}
                        <div className='border-border flex shrink-0 items-center rounded-lg border p-0.5'>
                            <button
                                onClick={() =>
                                    setChatSidebarView(
                                        CHAT_SIDEBAR_VIEW_MODE.TREE
                                    )
                                }
                                aria-label={t('chat.viewTree')}
                                className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                                    chatSidebarView ===
                                    CHAT_SIDEBAR_VIEW_MODE.TREE
                                        ? 'bg-foreground/10 text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <TreeStructureIcon
                                    className='h-3.5 w-3.5'
                                    weight={
                                        chatSidebarView ===
                                        CHAT_SIDEBAR_VIEW_MODE.TREE
                                            ? 'fill'
                                            : 'regular'
                                    }
                                />
                            </button>
                            <button
                                onClick={() =>
                                    setChatSidebarView(
                                        CHAT_SIDEBAR_VIEW_MODE.LIST
                                    )
                                }
                                aria-label={t('chat.viewList')}
                                className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                                    chatSidebarView ===
                                    CHAT_SIDEBAR_VIEW_MODE.LIST
                                        ? 'bg-foreground/10 text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <ListBulletsIcon
                                    className='h-3.5 w-3.5'
                                    weight={
                                        chatSidebarView ===
                                        CHAT_SIDEBAR_VIEW_MODE.LIST
                                            ? 'fill'
                                            : 'regular'
                                    }
                                />
                            </button>
                        </div>
                        {activeAgent &&
                            activeClaw &&
                            !mobileSidebarOpen &&
                            chatSidebarView === CHAT_SIDEBAR_VIEW_MODE.TREE && (
                                <button
                                    onClick={() =>
                                        handleOpenClawSettings(activeClaw.id)
                                    }
                                    aria-label={t('chat.clawSettings')}
                                    className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground shrink-0 rounded-lg p-1.5 transition-colors'
                                >
                                    <GearSixIcon
                                        className='h-4 w-4'
                                        weight='bold'
                                    />
                                </button>
                            )}
                    </div>
                )}
                <div className='relative flex min-h-0 flex-1 flex-col'>
                    <AnimatePresence>
                        {mobileSidebarOpen && (
                            <Fragment>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className='absolute inset-0 z-20 bg-black/50 md:hidden'
                                    onClick={closeMobileSidebar}
                                />
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.15 }}
                                    className='bg-background absolute inset-0 z-30 overflow-y-auto md:hidden'
                                >
                                    <ChatSidebar
                                        clawsWithAgents={clawsWithAgents}
                                        selectedAgent={selectedAgent}
                                        configAgent={configAgent}
                                        selectedClawId={settingsClawId}
                                        activeConnectionState={
                                            activeConnectionState
                                        }
                                        onAgentSelect={handleAgentSelect}
                                        onConfigureAgent={handleConfigureAgent}
                                        onCreateAgent={onCreateAgent}
                                        onOpenClawSettings={
                                            handleOpenClawSettings
                                        }
                                        onClose={closeMobileSidebar}
                                    />
                                </motion.div>
                            </Fragment>
                        )}
                    </AnimatePresence>
                    {settingsClaw && !selectedAgent ? (
                        <PlaygroundDetailPanel
                            key={`fullscreen-${settingsClaw.id}`}
                            claw={settingsClaw}
                            plans={plans}
                            sshKeys={sshKeys}
                            onClose={handleCloseClawSettings}
                            initialTab={initialClawTab}
                            onTabChange={onClawTabChange}
                            fullScreen
                        />
                    ) : selectedAgent && selectedAgentIsLoading ? (
                        <ChatSkeleton />
                    ) : activeAgent && activeClaw ? (
                        <div className='flex h-full flex-col'>
                            {activeAgent &&
                                chatSidebarView ===
                                    CHAT_SIDEBAR_VIEW_MODE.LIST && (
                                    <div className='bg-background border-border flex items-center gap-2.5 border-b px-4 py-2.5'>
                                        <ClawAvatar />
                                        <div className='min-w-0 flex-1 space-y-0.5'>
                                            <p className='text-foreground truncate text-sm font-semibold leading-tight'>
                                                {activeClaw.name}
                                            </p>
                                            <a
                                                href={`https://${activeClaw.subdomain || generateSlug(activeClaw.id)}.${getBaseDomain()}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='text-muted-foreground hover:text-foreground flex items-center gap-1 truncate text-[11px] leading-tight transition-colors'
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <ArrowSquareOutIcon className='h-2.5 w-2.5 shrink-0' />
                                                {activeClaw.subdomain ||
                                                    generateSlug(activeClaw.id)}
                                                .{getBaseDomain()}
                                            </a>
                                        </div>
                                        <div className='flex shrink-0 items-center gap-1'>
                                            <button
                                                onClick={() =>
                                                    handleOpenClawSettings(
                                                        activeClaw.id
                                                    )
                                                }
                                                aria-label={t(
                                                    'chat.clawSettings'
                                                )}
                                                className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-md p-1.5 transition-colors'
                                            >
                                                <GearSixIcon
                                                    className='h-4 w-4'
                                                    weight='bold'
                                                />
                                            </button>
                                            {headerClawActions && (
                                                <ClawCardDropdownMenu
                                                    claw={activeClaw}
                                                    actions={headerClawActions}
                                                    isLoading={isMutating}
                                                    hasActionItems={
                                                        activeClaw.status ===
                                                            clawStatus.running ||
                                                        activeClaw.status ===
                                                            clawStatus.stopped
                                                    }
                                                    isScheduledForDeletion={
                                                        !!activeClaw.deletionScheduledAt
                                                    }
                                                    isAdmin={
                                                        profile?.role ===
                                                        userRole.admin
                                                    }
                                                    compact
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}
                            <div className='flex min-h-0 flex-1'>
                                <div className='min-w-0 flex-1'>
                                    <AgentChat
                                        key={`${activeClaw.id}-${activeAgent.id}`}
                                        agentId={activeAgent.id}
                                        agentName={activeAgent.name}
                                        clawId={activeClaw.id}
                                        subdomain={activeClaw.subdomain}
                                        gatewayToken={activeClaw.gatewayToken}
                                        agentModel={activeAgent.model}
                                        onConnectionStateChange={
                                            handleConnectionStateChange
                                        }
                                    />
                                </div>
                                <AnimatePresence mode='wait'>
                                    {configAgentData && configClaw && (
                                        <motion.div
                                            key={`${configClaw.id}-${configAgentData.id}`}
                                            initial={{ width: 0, opacity: 0 }}
                                            animate={{ width: 380, opacity: 1 }}
                                            exit={{ width: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className='border-border hidden overflow-hidden border-l md:block'
                                        >
                                            <PlaygroundAgentDetailPanel
                                                agent={configAgentData}
                                                clawId={configClaw.id}
                                                clawName={configClaw.name}
                                                isOnlyAgent={configIsOnlyAgent}
                                                onClose={() =>
                                                    setConfigAgent(null)
                                                }
                                                gatewayToken={
                                                    configClaw.gatewayToken
                                                }
                                                subdomain={configClaw.subdomain}
                                                initialTab={initialAgentTab}
                                                onTabChange={onAgentTabChange}
                                                hideChatTab
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    ) : (
                        <ChatEmptyState />
                    )}
                </div>
            </div>
            {dialogsProps && <ClawCardDialogsBundle {...dialogsProps} />}
        </div>
    )
}

export default ChatView