import type { FC, ReactNode } from 'react'
import type { ChatSidebarAgentListProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { PlusIcon } from '@phosphor-icons/react'
import { Skeleton } from '@/components/ui'
import { GATEWAY_CONNECTION_STATE } from '@/lib/constants'
import { useGatewayState } from '@/hooks'
import ChatSidebarItem from '@/components/chat/ChatSidebarItem'

const ChatSidebarAgentList: FC<ChatSidebarAgentListProps> = ({
    claw,
    agents,
    isLoading,
    isReachable,
    selectedAgent,
    activeConnectionState,
    readOnly,
    onAgentClick,
    onConfigureAgent,
    onCreateAgent
}): ReactNode => {
    const gatewayState = useGatewayState(
        isReachable ? claw.subdomain : null,
        isReachable ? claw.gatewayToken : null
    )

    if (!isReachable) return null

    if (isLoading && agents.length === 0) {
        return (
            <div>
                <div className='relative flex py-0.5'>
                    <div className='relative ml-[19px] flex w-7 shrink-0 justify-start'>
                        <div className='bg-border absolute -top-1 left-0 h-[calc(22px+4px)] w-px' />
                        <div className='bg-border absolute left-0 top-[22px] h-px w-[calc(100%-6px)]' />
                    </div>
                    <div className='flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1'>
                        <Skeleton className='h-7 w-7 shrink-0 rounded-md' />
                        <div className='min-w-0 flex-1'>
                            <Skeleton className='h-3.5 w-24 rounded' />
                            <Skeleton className='mt-1 h-3 w-16 rounded' />
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div>
            {agents.map((agent, index) => {
                const isActiveAgent =
                    selectedAgent?.agentId === agent.id &&
                    selectedAgent?.clawId === claw.id
                const showAddAgent = isReachable && !readOnly
                const isLastItem = !showAddAgent && index === agents.length - 1

                return (
                    <ChatSidebarItem
                        key={agent.id}
                        agent={agent}
                        isActive={isActiveAgent}
                        isLast={isLastItem}
                        isChecking={
                            !readOnly &&
                            (gatewayState ===
                                GATEWAY_CONNECTION_STATE.CONNECTING ||
                                gatewayState ===
                                    GATEWAY_CONNECTION_STATE.AUTHENTICATING)
                        }
                        readOnly={readOnly}
                        connectionState={
                            readOnly
                                ? undefined
                                : isActiveAgent
                                  ? activeConnectionState
                                  : gatewayState ===
                                      GATEWAY_CONNECTION_STATE.CONNECTED
                                    ? GATEWAY_CONNECTION_STATE.CONNECTED
                                    : gatewayState ===
                                            GATEWAY_CONNECTION_STATE.ERROR ||
                                        gatewayState ===
                                            GATEWAY_CONNECTION_STATE.DISCONNECTED
                                      ? GATEWAY_CONNECTION_STATE.DISCONNECTED
                                      : undefined
                        }
                        onClick={() => onAgentClick(agent.id, claw.id)}
                        onConfigure={() => onConfigureAgent(agent.id, claw.id)}
                    />
                )
            })}
            {isReachable && !readOnly && (
                <div className='relative flex py-0.5'>
                    <div className='relative ml-[19px] flex w-7 shrink-0 justify-start'>
                        <div className='bg-border absolute -top-1 left-0 h-[calc(18px+4px)] w-px' />
                        <div className='bg-border absolute left-0 top-[18px] h-px w-[calc(100%-6px)]' />
                    </div>
                    <button
                        onClick={() => onCreateAgent(claw.id, claw.name)}
                        className='text-muted-foreground hover:bg-foreground/5 hover:text-foreground flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors'
                    >
                        <div className='border-border flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed'>
                            <PlusIcon className='h-3 w-3' weight='bold' />
                        </div>
                        <span className='text-[13px]'>
                            {t('chat.addAgent')}
                        </span>
                    </button>
                </div>
            )}
        </div>
    )
}

export default ChatSidebarAgentList