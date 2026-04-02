import type { FC, ReactNode } from 'react'
import type { ChatSidebarTreeViewProps } from '@/ts/Interfaces'

import { Fragment, useMemo } from 'react'
import { getStatusConfig } from '@/lib/claw-utils'
import ChatSidebarClawHeader from '@/components/chat/ChatSidebarClawHeader'
import ChatSidebarAgentList from '@/components/chat/ChatSidebarAgentList'

const ChatSidebarTreeView: FC<ChatSidebarTreeViewProps> = ({
    clawsWithAgents,
    selectedAgent,
    selectedClawId,
    activeConnectionState,
    readOnly,
    onAgentClick,
    onConfigureAgent,
    onCreateAgent,
    onOpenClawSettings
}): ReactNode => {
    const statusConfigs = useMemo(() => getStatusConfig(), [])

    return (
        <Fragment>
            {clawsWithAgents.map(({ claw, agents, isLoading, isReachable }) => {
                const status =
                    statusConfigs[claw.status] || statusConfigs.unknown

                return (
                    <div key={claw.id} className='mb-3 last:mb-0'>
                        <ChatSidebarClawHeader
                            claw={claw}
                            agentCount={agents.length}
                            isLoadingAgents={isLoading}
                            isReachable={isReachable}
                            isSelected={
                                selectedClawId === claw.id && !selectedAgent
                            }
                            statusConfig={status}
                            readOnly={readOnly}
                            onOpenClawSettings={onOpenClawSettings}
                            onCreateAgent={onCreateAgent}
                        />
                        <ChatSidebarAgentList
                            claw={claw}
                            agents={agents}
                            isLoading={isLoading}
                            isReachable={isReachable}
                            selectedAgent={selectedAgent}
                            activeConnectionState={activeConnectionState}
                            readOnly={readOnly}
                            onAgentClick={onAgentClick}
                            onConfigureAgent={onConfigureAgent}
                            onCreateAgent={onCreateAgent}
                        />
                    </div>
                )
            })}
        </Fragment>
    )
}

export default ChatSidebarTreeView