import type { FC, ReactNode } from 'react'
import type { DashboardChatViewProps } from '@/ts/Interfaces'

import { Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { EmptyState, ClawMascot } from '@/components'
import { PlaygroundLoadingState } from '@/components/playground'

const ChatView = lazy(() => import('@/components/chat/ChatView'))

const DashboardChatView: FC<DashboardChatViewProps> = ({
    displayedClaws,
    agentQueries,
    plans,
    sshKeys,
    adminMode,
    chatSelectedAgent,
    chatSettingsClawId,
    chatAgentTab,
    chatClawTab,
    onAgentSelect,
    onConfigureAgent,
    onCreateAgent,
    onSettingsClawChange,
    onAgentTabChange,
    onClawTabChange,
    onCreateClick
}): ReactNode => {
    return (
        <Suspense
            fallback={
                <div className='flex h-full min-w-0 flex-1 items-center justify-center'>
                    <PlaygroundLoadingState />
                </div>
            }
        >
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
                                icon={<ClawMascot className='h-10 w-10' />}
                                title={
                                    adminMode
                                        ? t('dashboard.adminNoClaws')
                                        : t('playground.noClawsYet')
                                }
                                description={
                                    adminMode
                                        ? t('dashboard.adminDescription')
                                        : t('playground.noClawsDescription')
                                }
                                actionLabel={t('nav.deployOpenClaw')}
                                onAction={onCreateClick}
                            />
                        </div>
                    </div>
                ) : (
                    <ChatView
                        claws={displayedClaws}
                        agentQueries={agentQueries}
                        plans={plans}
                        sshKeys={sshKeys}
                        selectedAgent={chatSelectedAgent}
                        onAgentSelect={onAgentSelect}
                        onConfigureAgent={onConfigureAgent}
                        onCreateAgent={onCreateAgent}
                        initialSettingsClawId={chatSettingsClawId}
                        onSettingsClawChange={onSettingsClawChange}
                        initialAgentTab={chatAgentTab || undefined}
                        onAgentTabChange={onAgentTabChange}
                        initialClawTab={chatClawTab || undefined}
                        onClawTabChange={onClawTabChange}
                    />
                )}
            </motion.div>
        </Suspense>
    )
}

export default DashboardChatView