import type { FC, ReactNode } from 'react'
import type { ChatSidebarAgentHeaderProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { agentStatus } from '@openclaw/shared'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { getBaseDomain, TRUNCATE_LENGTHS } from '@/lib'
import { generateSlug } from '@/lib/agent-utils'
import { AGENT_AVATAR_SIZE } from '@/lib/constants'
import { AgentAvatar } from '@/components/shared'
import { usePreferencesStore } from '@/lib/store'

const ChatSidebarAgentHeader: FC<ChatSidebarAgentHeaderProps> = ({
    agent,
    isSelected,
    statusConfig,
    onOpenAgentSettings
}): ReactNode => {
    const adminMode = usePreferencesStore((s) => s.adminMode)

    return (
        <Fragment>
            <div
                onClick={() => onOpenAgentSettings(agent.id)}
                className={`group/header relative mb-1.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isSelected ? 'bg-foreground/10' : 'hover:bg-foreground/5'
                }`}
            >
                <div className='relative shrink-0'>
                    <AgentAvatar
                        emoji={agent.emoji}
                        emojiColor={agent.emojiColor}
                        size={AGENT_AVATAR_SIZE.SM}
                    />
                    {adminMode && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className='border-background absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2'>
                                    <div
                                        className={`h-2 w-2 rounded-full ${statusConfig.color} ${statusConfig.pulse ? 'animate-pulse' : 'status-dot-alive'}`}
                                    />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side='bottom'>
                                <p>{statusConfig.label}</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
                <div className='min-w-0 flex-1'>
                    {agent.name.length > TRUNCATE_LENGTHS.SIDEBAR_AGENT_NAME ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className='text-foreground truncate text-[13px] font-medium'>
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
                        <p className='text-foreground truncate text-[13px] font-medium'>
                            {agent.name}
                        </p>
                    )}
                </div>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                if (agent.status !== agentStatus.running) return
                                const subdomain =
                                    agent.subdomain || generateSlug(agent.id)
                                const url = `https://${subdomain}.${getBaseDomain()}${agent.gatewayToken ? `/?token=${agent.gatewayToken}` : ''}`
                                window.open(url, '_blank')
                            }}
                            disabled={agent.status !== agentStatus.running}
                            className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground shrink-0 rounded-md p-1 transition-colors disabled:cursor-default disabled:opacity-30'
                        >
                            <ArrowSquareOutIcon className='h-3.5 w-3.5' />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side='bottom'>
                        {t('dashboard.openControlPanel')}
                    </TooltipContent>
                </Tooltip>
            </div>
        </Fragment>
    )
}

export default ChatSidebarAgentHeader