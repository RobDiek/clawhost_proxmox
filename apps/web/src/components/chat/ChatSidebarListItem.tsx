import type { FC, ReactNode } from 'react'
import type { ChatSidebarListItemProps } from '@/ts/Interfaces'

import { useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { AndroidLogoIcon, GearSixIcon } from '@phosphor-icons/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { TRUNCATE_LENGTHS } from '@/lib'
import { GATEWAY_CONNECTION_STATE } from '@/lib/constants'
import { aiModels, getAgentStatusConfig } from '@/lib/claw-utils'
import { useGatewayState } from '@/hooks'

const ChatSidebarListItem: FC<ChatSidebarListItemProps> = ({
    agentName,
    agentModel,
    agentStatus,
    clawName,
    clawSubdomain,
    clawGatewayToken,
    isReachable,
    isActive,
    activeConnectionState,
    readOnly,
    onClick,
    onConfigure
}): ReactNode => {
    const modelName = agentModel
        ? aiModels.find((m) => m.id === agentModel)?.name || agentModel
        : null

    const gatewayState = useGatewayState(
        isReachable ? clawSubdomain : null,
        isReachable ? clawGatewayToken : null
    )

    const statusConfig = useMemo(() => {
        if (!readOnly) {
            if (activeConnectionState) {
                switch (activeConnectionState) {
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
            if (
                gatewayState === GATEWAY_CONNECTION_STATE.CONNECTING ||
                gatewayState === GATEWAY_CONNECTION_STATE.AUTHENTICATING
            ) {
                return {
                    color: 'bg-orange-500',
                    label: t('dashboard.status.checking'),
                    pulse: true
                }
            }
            if (gatewayState === GATEWAY_CONNECTION_STATE.CONNECTED) {
                return {
                    color: 'bg-green-500',
                    label: t('dashboard.status.running')
                }
            }
            if (
                gatewayState === GATEWAY_CONNECTION_STATE.ERROR ||
                gatewayState === GATEWAY_CONNECTION_STATE.DISCONNECTED
            ) {
                return {
                    color: 'bg-red-500',
                    label: t('dashboard.status.unreachable')
                }
            }
        }
        const agentStatusConfig = getAgentStatusConfig(agentStatus)
        return {
            color: agentStatusConfig.color,
            label: agentStatusConfig.label,
            pulse: agentStatusConfig.pulse
        }
    }, [readOnly, activeConnectionState, gatewayState, agentStatus])

    return (
        <button
            onClick={onClick}
            className={`group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                isActive
                    ? 'bg-foreground/10 text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            }`}
        >
            <div className='relative shrink-0'>
                <div className='bg-foreground/5 flex h-8 w-8 items-center justify-center rounded-lg'>
                    <AndroidLogoIcon className='h-4 w-4' weight='fill' />
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
                {agentName.length > TRUNCATE_LENGTHS.SIDEBAR_AGENT_NAME ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <p className='text-foreground text-[13px] font-medium'>
                                {agentName.slice(
                                    0,
                                    TRUNCATE_LENGTHS.SIDEBAR_AGENT_NAME
                                )}
                                ...
                            </p>
                        </TooltipTrigger>
                        <TooltipContent>{agentName}</TooltipContent>
                    </Tooltip>
                ) : (
                    <p className='text-foreground text-[13px] font-medium'>
                        {agentName}
                    </p>
                )}
                <p className='text-muted-foreground truncate text-[11px]'>
                    {clawName}
                    {modelName ? ` · ${modelName}` : ''}
                </p>
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
    )
}

export default ChatSidebarListItem