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
import { ListIcon, XIcon } from '@phosphor-icons/react'
import { EmptyState, ClawMascot } from '@/components'
import { ClawDetailPanel } from '@/components/dashboard'
import { ChatSidebar } from '@/components/chat'
import { ChatEmptyState } from '@/components/chat'

const DashboardChatView: FC<DashboardChatViewProps> = ({
    displayedClaws,
    plans,
    sshKeys,
    adminMode,
    chatSettingsClawId,
    chatClawTab,
    onSettingsClawChange,
    onClawTabChange,
    onCreateClick
}): ReactNode => {
    const [settingsClawId, setSettingsClawId] = useState<string | null>(
        chatSettingsClawId || null
    )
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const isInitialMount = useRef(true)
    const hasAutoSelected = useRef(false)

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false
            return
        }
        onSettingsClawChange?.(settingsClawId)
    }, [settingsClawId])

    useEffect(() => {
        if (
            !hasAutoSelected.current &&
            !settingsClawId &&
            displayedClaws.length > 0
        ) {
            hasAutoSelected.current = true
            setSettingsClawId(displayedClaws[0].id)
        }
    }, [settingsClawId, displayedClaws])

    const settingsClaw = useMemo(() => {
        if (!settingsClawId) return null
        return displayedClaws.find((c) => c.id === settingsClawId) || null
    }, [displayedClaws, settingsClawId])

    const closeMobileSidebar = useCallback(() => {
        setMobileSidebarOpen(false)
    }, [])

    const handleOpenClawSettings = useCallback(
        (clawId: string) => {
            if (settingsClawId === clawId) {
                setSettingsClawId(null)
                setMobileSidebarOpen(false)
                return
            }
            setSettingsClawId(clawId)
            setMobileSidebarOpen(false)
        },
        [settingsClawId]
    )

    const handleCloseClawSettings = useCallback(() => {
        setSettingsClawId(null)
    }, [])

    const mobileLabel = useMemo(() => {
        if (settingsClaw) return settingsClaw.name
        return t('nav.claws')
    }, [settingsClaw])

    if (displayedClaws.length === 0) {
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
                            icon={<ClawMascot className='h-10 w-10' />}
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
                        claws={displayedClaws}
                        selectedClawId={settingsClawId}
                        onOpenClawSettings={handleOpenClawSettings}
                    />
                </div>
                <div className='max-md:bg-background flex min-w-0 flex-1 flex-col max-md:relative max-md:z-10'>
                    {!settingsClaw && mobileSidebarOpen && (
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
                                            claws={displayedClaws}
                                            selectedClawId={settingsClawId}
                                            onOpenClawSettings={
                                                handleOpenClawSettings
                                            }
                                            onClose={closeMobileSidebar}
                                        />
                                    </motion.div>
                                </Fragment>
                            )}
                        </AnimatePresence>
                        {settingsClaw ? (
                            <ClawDetailPanel
                                key={`fullscreen-${settingsClaw.id}`}
                                claw={settingsClaw}
                                plans={plans}
                                sshKeys={sshKeys}
                                onClose={handleCloseClawSettings}
                                initialTab={chatClawTab || undefined}
                                onTabChange={onClawTabChange}
                                fullScreen
                            />
                        ) : (
                            <Fragment>
                                <div className='hidden md:flex md:flex-1 md:items-center md:justify-center'>
                                    <ChatEmptyState />
                                </div>
                                <div className='flex-1 overflow-y-auto md:hidden'>
                                    <ChatSidebar
                                        claws={displayedClaws}
                                        selectedClawId={settingsClawId}
                                        onOpenClawSettings={
                                            handleOpenClawSettings
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