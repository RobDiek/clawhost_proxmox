import type { FC, ReactNode } from 'react'
import type { AgentDetailHeaderProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    XIcon,
    CircleNotchIcon,
    TrashIcon,
    ArrowsOutIcon,
    ArrowsInIcon
} from '@phosphor-icons/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { ClawAvatar } from '@/components/shared'
import { TRUNCATE_LENGTHS } from '@/lib'
import { AGENT_DETAIL_TABS } from '@/lib/constants'

const AgentDetailHeader: FC<AgentDetailHeaderProps> = ({
    agent,
    clawName,
    isOnlyAgent,
    isExpanded,
    isDeleting,
    readOnly,
    hideChatTab,
    activeTab,
    onToggleExpand,
    onDeleteClick,
    onClose
}): ReactNode => {
    return (
        <div className='border-border flex items-center justify-between border-b px-5 py-2.5'>
            <div className='flex items-center gap-2.5'>
                <ClawAvatar />
                <div className='space-y-0'>
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
                                <TooltipContent>{agent.name}</TooltipContent>
                            </Tooltip>
                        ) : (
                            agent.name
                        )}
                    </h3>
                    <span className='text-muted-foreground block text-xs leading-tight'>
                        {clawName.length >
                        TRUNCATE_LENGTHS.PANEL_CLAW_SUBTITLE ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span>
                                        {t('playground.agentOnClaw', {
                                            clawName:
                                                clawName.slice(
                                                    0,
                                                    TRUNCATE_LENGTHS.PANEL_CLAW_SUBTITLE
                                                ) + '...'
                                        })}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>{clawName}</TooltipContent>
                            </Tooltip>
                        ) : (
                            t('playground.agentOnClaw', { clawName })
                        )}
                    </span>
                </div>
            </div>
            <div className='flex items-center gap-1'>
                {!hideChatTab &&
                    (activeTab === AGENT_DETAIL_TABS.CHAT || isExpanded) && (
                        <button
                            onClick={onToggleExpand}
                            className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-lg p-1.5 transition-colors'
                        >
                            {isExpanded ? (
                                <ArrowsInIcon
                                    className='h-4 w-4'
                                    weight='bold'
                                />
                            ) : (
                                <ArrowsOutIcon
                                    className='h-4 w-4'
                                    weight='bold'
                                />
                            )}
                        </button>
                    )}
                {!readOnly &&
                    (agent.id === 'main' || isOnlyAgent ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className='inline-flex'>
                                    <button
                                        disabled
                                        className='text-muted-foreground cursor-not-allowed rounded-lg p-1.5 opacity-50 transition-colors'
                                    >
                                        <TrashIcon
                                            className='h-4 w-4'
                                            weight='bold'
                                        />
                                    </button>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side='bottom'>
                                <p>
                                    {t('playground.cannotDeleteDefaultAgent')}
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <button
                            onClick={() => !isDeleting && onDeleteClick()}
                            disabled={isDeleting}
                            className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-lg p-1.5 transition-colors disabled:cursor-not-allowed'
                        >
                            {isDeleting ? (
                                <CircleNotchIcon className='text-foreground h-4 w-4 animate-spin' />
                            ) : (
                                <TrashIcon className='h-4 w-4' weight='bold' />
                            )}
                        </button>
                    ))}
                <button
                    onClick={onClose}
                    className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-lg p-1.5 transition-colors'
                >
                    <XIcon className='h-4 w-4' weight='bold' />
                </button>
            </div>
        </div>
    )
}

export default AgentDetailHeader