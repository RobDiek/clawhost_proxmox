import type { FC, ReactNode } from 'react'
import type { ChatSidebarAgentHeaderProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { TRUNCATE_LENGTHS } from '@/lib'
import { AGENT_AVATAR_SIZE } from '@/lib/constants'
import { AgentAvatar } from '@/components/shared'
import { usePreferencesStore } from '@/lib/store'
import { agentTypes } from '@/data'

const ChatSidebarAgentHeader: FC<ChatSidebarAgentHeaderProps> = ({
    agent,
    isSelected,
    statusConfig,
    onOpenAgentSettings
}): ReactNode => {
    const adminMode = usePreferencesStore((s) => s.adminMode)
    const agentTypeOption = agentTypes.find(
        (option) => option.type === agent.agentType
    )

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
                        agentType={agent.agentType}
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
                <div className='flex min-w-0 flex-1 flex-col'>
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
                    {agentTypeOption && (
                        <p className='text-muted-foreground truncate text-[10px]'>
                            {t(agentTypeOption.nameKey)}
                        </p>
                    )}
                </div>
            </div>
        </Fragment>
    )
}

export default ChatSidebarAgentHeader