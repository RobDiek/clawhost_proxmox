import type { FC, ReactNode } from 'react'
import type { ChatSidebarListViewProps } from '@/ts/Interfaces'

import { Fragment, useState, useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { PlusIcon } from '@phosphor-icons/react'
import { CreateAgentModal } from '@/components/playground'
import ChatSidebarListItem from '@/components/chat/ChatSidebarListItem'

const ChatSidebarListView: FC<ChatSidebarListViewProps> = ({
    clawsWithAgents,
    selectedAgent,
    activeConnectionState,
    readOnly,
    onAgentClick,
    onConfigureAgent
}): ReactNode => {
    const [showAddAgent, setShowAddAgent] = useState(false)

    const allAgents = useMemo(() => {
        return clawsWithAgents.flatMap(({ claw, agents, isReachable }) =>
            agents.map((agent) => ({
                agent,
                claw,
                isReachable
            }))
        )
    }, [clawsWithAgents])

    const hasReachableClaws = useMemo(() => {
        return clawsWithAgents.some((c) => c.isReachable)
    }, [clawsWithAgents])

    return (
        <Fragment>
            <div className='space-y-1'>
                {allAgents.map(({ agent, claw, isReachable }) => (
                    <ChatSidebarListItem
                        key={`${claw.id}-${agent.id}`}
                        agentId={agent.id}
                        agentName={agent.name}
                        agentModel={agent.model}
                        agentStatus={agent.status}
                        clawId={claw.id}
                        clawName={claw.name}
                        clawSubdomain={claw.subdomain}
                        clawGatewayToken={claw.gatewayToken}
                        isReachable={isReachable}
                        isActive={
                            selectedAgent?.agentId === agent.id &&
                            selectedAgent?.clawId === claw.id
                        }
                        activeConnectionState={
                            selectedAgent?.agentId === agent.id &&
                            selectedAgent?.clawId === claw.id
                                ? activeConnectionState
                                : undefined
                        }
                        readOnly={readOnly}
                        onClick={() => onAgentClick(agent.id, claw.id)}
                        onConfigure={() => onConfigureAgent(agent.id, claw.id)}
                    />
                ))}
                {!readOnly && hasReachableClaws && (
                    <button
                        onClick={() => setShowAddAgent(true)}
                        className='text-muted-foreground hover:bg-foreground/5 hover:text-foreground flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors'
                    >
                        <div className='border-border flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed'>
                            <PlusIcon className='h-3.5 w-3.5' weight='bold' />
                        </div>
                        <span className='text-[13px]'>
                            {t('chat.addAgent')}
                        </span>
                    </button>
                )}
            </div>
            <CreateAgentModal
                clawsWithAgents={clawsWithAgents}
                open={showAddAgent}
                onOpenChange={setShowAddAgent}
            />
        </Fragment>
    )
}

export default ChatSidebarListView