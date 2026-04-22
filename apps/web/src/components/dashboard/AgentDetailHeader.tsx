import type { FC, ReactNode } from 'react'
import type { AgentDetailHeaderProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { agentStatus } from '@openclaw/shared'
import { generateSlug, getStatusConfig } from '@/lib/agent-utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { useAgentCardActions } from '@/hooks'
import {
    AgentCardDialogsBundle,
    HeaderActionButton
} from '@/components/dashboard'
import { getBaseDomain, TRUNCATE_LENGTHS } from '@/lib'

import {
    XIcon,
    ArrowSquareOutIcon,
    PlayIcon,
    StopIcon,
    ArrowsClockwiseIcon
} from '@phosphor-icons/react'

const AgentDetailHeader: FC<AgentDetailHeaderProps> = ({
    agent,
    onClose,
    fullScreen,
    versionDisplay,
    readOnly
}): ReactNode => {
    const { actions, isMutating, dialogsProps } = useAgentCardActions({ agent })

    const isPending =
        agent.status === agentStatus.creating ||
        agent.status === agentStatus.configuring ||
        agent.status === agentStatus.awaitingPayment
    const hasActionItems =
        agent.status === agentStatus.running ||
        agent.status === agentStatus.stopped
    const statusConfigs = getStatusConfig()
    const statusConfig = statusConfigs[agent.status]

    return (
        <Fragment>
            <div className='border-border flex items-center justify-between border-b p-2.5 px-3.5'>
                <div className='flex items-center gap-2.5'>
                    <div className='space-y-px'>
                        <h3 className='text-foreground text-sm font-semibold leading-tight'>
                            {agent.name.length > TRUNCATE_LENGTHS.PANEL_NAME ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span>
                                            {agent.name.slice(
                                                0,
                                                TRUNCATE_LENGTHS.PANEL_NAME
                                            )}
                                            ...
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {agent.name}
                                    </TooltipContent>
                                </Tooltip>
                            ) : (
                                <span>{agent.name}</span>
                            )}
                        </h3>
                        {agent.status !== agentStatus.creating &&
                            agent.status !== agentStatus.configuring &&
                            agent.status !== agentStatus.awaitingPayment && (
                                <div className='text-muted-foreground flex items-center gap-1.5 text-xs leading-tight'>
                                    <a
                                        href={`https://${agent.subdomain || generateSlug(agent.id)}.${getBaseDomain()}${agent.gatewayToken ? `/?token=${agent.gatewayToken}` : ''}`}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='hover:text-foreground/80 flex items-center gap-1 truncate transition-colors'
                                    >
                                        <ArrowSquareOutIcon className='h-3 w-3 shrink-0' />
                                        {agent.subdomain ||
                                            generateSlug(agent.id)}
                                        .{getBaseDomain()}
                                    </a>
                                    {versionDisplay && (
                                        <span className='flex items-center gap-1.5'>
                                            <span className='bg-muted-foreground/40 h-0.5 w-0.5 rounded-full' />
                                            <span>{versionDisplay}</span>
                                        </span>
                                    )}
                                </div>
                            )}
                    </div>
                </div>
                <div className='flex items-center gap-1.5'>
                    {statusConfig && !isPending && (
                        <span
                            className={`border-border inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium leading-none ${statusConfig.bgColor}`}
                        >
                            <span
                                className={`h-1.5 w-1.5 rounded-full ${statusConfig.color} ${statusConfig.pulse ? 'animate-pulse' : ''}`}
                            />
                            {statusConfig.label}
                        </span>
                    )}
                    {actions && hasActionItems && !readOnly && (
                        <div className='flex items-center gap-1'>
                            {agent.status === agentStatus.stopped && (
                                <HeaderActionButton
                                    icon={PlayIcon}
                                    label={t('dashboard.startServer')}
                                    onClick={actions.onStart}
                                    disabled={isMutating}
                                />
                            )}
                            {agent.status === agentStatus.running && (
                                <HeaderActionButton
                                    icon={StopIcon}
                                    label={t('dashboard.stopServer')}
                                    onClick={actions.onShowStopModal}
                                    disabled={isMutating}
                                />
                            )}
                            {agent.status === agentStatus.running && (
                                <HeaderActionButton
                                    icon={ArrowsClockwiseIcon}
                                    label={t('dashboard.restartServer')}
                                    onClick={actions.onShowRestartModal}
                                    disabled={isMutating}
                                />
                            )}
                        </div>
                    )}
                    <button
                        onClick={onClose}
                        className={`text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-lg p-1.5 transition-colors ${fullScreen ? 'md:hidden' : ''}`}
                    >
                        <XIcon className='h-4 w-4' weight='bold' />
                    </button>
                </div>
            </div>
            {dialogsProps && <AgentCardDialogsBundle {...dialogsProps} />}
        </Fragment>
    )
}

export default AgentDetailHeader