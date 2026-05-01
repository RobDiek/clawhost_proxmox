import type { FC, ReactNode } from 'react'
import type { DashboardChatViewProps } from '@/ts/Interfaces'

import {
    Fragment,
    useState,
    useEffect,
    useMemo,
    useCallback,
    useRef
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { ListIcon, XIcon, GhostIcon } from '@phosphor-icons/react'
import { EmptyState } from '@/components'
import { AgentDetailPanel } from '@/components/dashboard'
import { ChatSidebar } from '@/components/chat'
import { ChatEmptyState } from '@/components/chat'

const DashboardChatView: FC<DashboardChatViewProps> = ({
    displayedAgents,
    plans,
    sshKeys,
    adminMode,
    chatSettingsAgentId,
    chatAgentTab,
    onSettingsAgentChange,
    onAgentTabChange,
    onCreateClick
}): ReactNode => {
    const [settingsAgentId, setSettingsAgentId] = useState<string | null>(
        chatSettingsAgentId || null
    )
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const isInitialMount = useRef(true)
    const hasAutoSelected = useRef(false)

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false
            return
        }
        onSettingsAgentChange?.(settingsAgentId)
    }, [settingsAgentId])

    useEffect(() => {
        if (
            !hasAutoSelected.current &&
            !settingsAgentId &&
            displayedAgents.length > 0
        ) {
            hasAutoSelected.current = true
            setSettingsAgentId(displayedAgents[0].id)
        }
    }, [settingsAgentId, displayedAgents])

    const settingsAgent = useMemo(() => {
        if (!settingsAgentId) return null
        return displayedAgents.find((c) => c.id === settingsAgentId) || null
    }, [displayedAgents, settingsAgentId])

    const closeMobileSidebar = useCallback(() => {
        setMobileSidebarOpen(false)
    }, [])

    const handleOpenAgentSettings = useCallback(
        (agentId: string) => {
            if (settingsAgentId === agentId) {
                setSettingsAgentId(null)
                setMobileSidebarOpen(false)
                return
            }
            setSettingsAgentId(agentId)
            setMobileSidebarOpen(false)
        },
        [settingsAgentId]
    )

    const handleCloseAgentSettings = useCallback(() => {
        setSettingsAgentId(null)
    }, [])

    const mobileLabel = useMemo(() => {
        if (settingsAgent) return settingsAgent.name
        return t('nav.claws')
    }, [settingsAgent])

    if (displayedAgents.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className='flex h-full min-w-0 flex-1'
            >
                <div className='flex h-full min-w-0 flex-1 items-center justify-center'>
                    <div className='-mt-20'>
                        <EmptyState
                            icon={
                                <GhostIcon
                                    weight='fill'
                                    className='h-10 w-10'
                                />
                            }
                            title={
                                adminMode
                                    ? t('dashboard.adminNoClaws')
                                    : t('clawDetail.noAgentsYet')
                            }
                            description={
                                adminMode
                                    ? t('dashboard.adminDescription')
                                    : t('clawDetail.noAgentsDescription')
                            }
                            actionLabel={t('nav.deployOpenClaw')}
                            onAction={onCreateClick}
                        />
                    </div>
                </div>
            </motion.div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className='flex h-full min-w-0 flex-1'
        >
            <div className='relative flex h-full w-full overflow-hidden'>
                <div className='playground-grid pointer-events-none absolute inset-0 opacity-50' />
                <div className='hidden md:block'>
                    <ChatSidebar
                        agents={displayedAgents}
                        selectedAgentId={settingsAgentId}
                        onOpenAgentSettings={handleOpenAgentSettings}
                    />
                </div>
                <div className='max-md:bg-background flex min-w-0 flex-1 flex-col max-md:relative max-md:z-10'>
                    {!settingsAgent && mobileSidebarOpen && (
                        <div className='border-border bg-background flex items-center gap-2 border-b px-4 py-2.5 md:hidden'>
                            <button
                                onClick={() =>
                                    setMobileSidebarOpen(!mobileSidebarOpen)
                                }
                                className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-lg p-1.5 transition-colors'
                            >
                                {mobileSidebarOpen ? (
                                    <XIcon className='h-5 w-5' weight='bold' />
                                ) : (
                                    <ListIcon
                                        className='h-5 w-5'
                                        weight='bold'
                                    />
                                )}
                            </button>
                            <span className='text-foreground/80 min-w-0 flex-1 truncate text-sm font-medium'>
                                {mobileLabel}
                            </span>
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
                                            agents={displayedAgents}
                                            selectedAgentId={settingsAgentId}
                                            onOpenAgentSettings={
                                                handleOpenAgentSettings
                                            }
                                            onClose={closeMobileSidebar}
                                        />
                                    </motion.div>
                                </Fragment>
                            )}
                        </AnimatePresence>
                        {settingsAgent ? (
                            <AgentDetailPanel
                                key={`fullscreen-${settingsAgent.id}`}
                                agent={settingsAgent}
                                plans={plans}
                                sshKeys={sshKeys}
                                onClose={handleCloseAgentSettings}
                                initialTab={chatAgentTab || undefined}
                                onTabChange={onAgentTabChange}
                                fullScreen
                            />
                        ) : (
                            <Fragment>
                                <div className='hidden md:flex md:flex-1 md:items-center md:justify-center'>
                                    <ChatEmptyState />
                                </div>
                                <div className='flex-1 overflow-y-auto md:hidden'>
                                    <ChatSidebar
                                        agents={displayedAgents}
                                        selectedAgentId={settingsAgentId}
                                        onOpenAgentSettings={
                                            handleOpenAgentSettings
                                        }
                                    />
                                </div>
                            </Fragment>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

export default DashboardChatView