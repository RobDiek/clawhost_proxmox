import type { FC, ReactNode } from 'react'
import type { PlaygroundAgentNodeProps } from '@/ts/Interfaces'

import { useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { Handle, Position } from '@xyflow/react'
import { AndroidLogoIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { TRUNCATE_LENGTHS } from '@/lib'
import { GATEWAY_CONNECTION_STATE } from '@/lib/constants'
import { getAgentStatusConfig } from '@/lib/claw-utils'
import { useGatewayState } from '@/hooks'

const handleStyle = {
    top: 0,
    width: 0,
    height: 0,
    minWidth: 0,
    minHeight: 0,
    border: 'none',
    background: 'none',
    opacity: 0
}

const PlaygroundAgentNode: FC<PlaygroundAgentNodeProps> = ({
    data
}): ReactNode => {
    const { agent, isSelected, subdomain, gatewayToken } = data

    const gatewayState = useGatewayState(subdomain, gatewayToken)

    const status = useMemo(() => {
        if (subdomain && gatewayToken) {
            if (
                gatewayState === GATEWAY_CONNECTION_STATE.CONNECTING ||
                gatewayState === GATEWAY_CONNECTION_STATE.AUTHENTICATING
            ) {
                return {
                    color: 'bg-orange-500',
                    bgColor: 'bg-orange-500/10',
                    label: t('dashboard.status.checking'),
                    pulse: true
                }
            }
            if (gatewayState === GATEWAY_CONNECTION_STATE.CONNECTED) {
                return {
                    color: 'bg-green-500',
                    bgColor: 'bg-green-500/10',
                    label: t('dashboard.status.running')
                }
            }
            if (
                gatewayState === GATEWAY_CONNECTION_STATE.ERROR ||
                gatewayState === GATEWAY_CONNECTION_STATE.DISCONNECTED
            ) {
                return {
                    color: 'bg-red-500',
                    bgColor: 'bg-red-500/10',
                    label: t('dashboard.status.unreachable')
                }
            }
        }
        return getAgentStatusConfig(agent.status)
    }, [subdomain, gatewayToken, gatewayState, agent.status])

    return (
        <div
            className={`playground-node-enter bg-popover relative w-[240px] cursor-pointer rounded-lg border border-l-2 transition-all ${
                isSelected
                    ? 'border-b-[#ef5350]/50 border-l-[#ef5350] border-r-[#ef5350]/50 border-t-[#ef5350]/50 shadow-[0_0_20px_rgba(239,83,80,0.15)]'
                    : 'border-b-border border-r-border border-t-border border-l-[#ef5350]'
            }`}
        >
            <Handle
                type='target'
                position={Position.Top}
                isConnectable={false}
                style={handleStyle}
            />

            <div className='px-3.5 py-3'>
                <div className='flex items-center gap-2'>
                    <AndroidLogoIcon className='h-4 w-4' weight='fill' />
                    {agent.name.length > TRUNCATE_LENGTHS.NODE_AGENT_NAME ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className='text-foreground truncate text-sm font-medium'>
                                    {agent.name.slice(
                                        0,
                                        TRUNCATE_LENGTHS.NODE_AGENT_NAME
                                    )}
                                    ...
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>{agent.name}</TooltipContent>
                        </Tooltip>
                    ) : (
                        <span className='text-foreground truncate text-sm font-medium'>
                            {agent.name}
                        </span>
                    )}
                    <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.bgColor}`}
                    >
                        {status.pulse ? (
                            <CircleNotchIcon
                                className={`h-3 w-3 animate-spin ${status.color.replace('bg-', 'text-')}`}
                                weight='bold'
                            />
                        ) : (
                            <span
                                className={`h-1.5 w-1.5 rounded-full ${status.color} status-dot-alive`}
                            />
                        )}
                        {status.label}
                    </span>
                </div>

                {typeof agent.model === 'string' && (
                    <div className='bg-foreground/5 mt-2 inline-flex rounded-md px-2 py-0.5'>
                        <span className='text-muted-foreground truncate text-[11px]'>
                            {agent.model}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

export default PlaygroundAgentNode