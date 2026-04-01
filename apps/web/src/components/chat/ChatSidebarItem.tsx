import type { FC, ReactNode } from 'react'
import type { ChatSidebarItemProps } from '@/ts/Interfaces'

import { useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { GearSixIcon, AndroidLogoIcon } from '@phosphor-icons/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { TRUNCATE_LENGTHS } from '@/lib'
import { GATEWAY_CONNECTION_STATE } from '@/lib/constants'
import { aiModels, getAgentStatusConfig } from '@/lib/claw-utils'

const ChatSidebarItem: FC<ChatSidebarItemProps> = ({
    agent,
    isActive,
    isLast,
    isChecking,
    connectionState,
    onClick,
    onConfigure
}): ReactNode => {
    const modelName =
        typeof agent.model === 'string'
            ? aiModels.find((m) => m.id === agent.model)?.name || agent.model
            : null

    const statusConfig = useMemo(() => {
        if (connectionState) {
            switch (connectionState) {
                case GATEWAY_CONNECTION_STATE.CONNECTED:
                    return {
                        color: 'bg-green-500',
                        label: t('dashboard.status.running')
                    }
                case GATEWAY_CONNECTION_STATE.CONNECTING:
                case GATEWAY_CONNECTION_STATE.AUTHENTICATING:
                    return {
                        color: 'bg-yellow-500',
                        label: t('playground.chatConnecting'),
                        pulse: true
                    }
                case GATEWAY_CONNECTION_STATE.ERROR:
                    return {
                        color: 'bg-red-500',
                        label: t('playground.chatError')
                    }
                case GATEWAY_CONNECTION_STATE.DISCONNECTED:
                    return {
                        color: 'bg-red-500',
                        label: t('dashboard.status.unreachable')
                    }
                default:
                    break
            }
        }
        if (isChecking) {
            return {
                color: 'bg-orange-500',
                label: t('dashboard.status.checking'),
                pulse: true
            }
        }
        const agentStatus = getAgentStatusConfig(agent.status)
        return {
            color: agentStatus.color,
            label: agentStatus.label,
            pulse: agentStatus.pulse
        }
    }, [connectionState, isChecking, agent.status])

    return (
        <div className='relative flex py-0.5'>
            <div className='relative ml-[19px] flex w-7 shrink-0 justify-start'>
                <div
                    className={`bg-border absolute left-0 w-px ${isLast ? 'top-0 h-[22px]' : '-bottom-1 -top-1'}`}
                />
                <div className='bg-border absolute left-0 top-[22px] h-px w-[calc(100%-6px)]' />
            </div>
            <button
                onClick={onClick}
                className={`group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors ${
                    isActive
                        ? 'bg-foreground/10 text-foreground'
                        : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                }`}
            >
                <div className='relative'>
                    <div className='bg-foreground/5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md'>
                        <AndroidLogoIcon
                            className='h-3.5 w-3.5'
                            weight='fill'
                        />
                    </div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className='border-background absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2'>
                                <div
                                    className={`h-1.5 w-1.5 rounded-full ${statusConfig.color} ${statusConfig.pulse ? 'animate-pulse' : 'status-dot-alive'}`}
                                />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side='bottom'>
                            <p>{statusConfig.label}</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
                <div className='min-w-0 flex-1'>
                    {agent.name.length > TRUNCATE_LENGTHS.SIDEBAR_AGENT_NAME ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className='text-foreground text-[13px] font-medium'>
                                    {agent.name.slice(
                                        0,
                                        TRUNCATE_LENGTHS.SIDEBAR_AGENT_NAME
                                    )}
                                    ...
                                </p>
                            </TooltipTrigger>
                            <TooltipContent>{agent.name}</TooltipContent>
                        </Tooltip>
                    ) : (
                        <p className='text-foreground text-[13px] font-medium'>
                            {agent.name}
                        </p>
                    )}
                    {modelName ? (
                        <p className='text-muted-foreground truncate text-[11px]'>
                            {modelName}
                        </p>
                    ) : (
                        <p className='text-muted-foreground truncate text-[11px] italic'>
                            {t('chat.notConfigured')}
                        </p>
                    )}
                </div>
                <div
                    role='button'
                    tabIndex={-1}
                    onClick={(e) => {
                        e.stopPropagation()
                        onConfigure()
                    }}
                    className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors'
                >
                    <GearSixIcon className='h-3 w-3' weight='bold' />
                </div>
            </button>
        </div>
    )
}

export default ChatSidebarItem