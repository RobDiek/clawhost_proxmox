import type { FC, ReactNode } from 'react'
import type { ChatSidebarClawHeaderProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { clawStatus, userRole } from '@openclaw/shared'
import { ClockIcon } from '@phosphor-icons/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { getLocale, TRUNCATE_LENGTHS } from '@/lib'
import { CLAW_AVATAR_SIZE } from '@/lib/constants'
import { ClawAvatar } from '@/components/shared'
import { useProfile, useClawCardActions } from '@/hooks'
import {
    ClawCardDropdownMenu,
    ClawCardDialogsBundle
} from '@/components/dashboard'

const ChatSidebarClawHeader: FC<ChatSidebarClawHeaderProps> = ({
    claw,
    agentCount,
    isLoadingAgents,
    isReachable: _isReachable,
    isSelected,
    statusConfig,
    readOnly,
    onOpenClawSettings,
    onCreateAgent: _onCreateAgent
}): ReactNode => {
    const { actions, isMutating, dialogsProps } = useClawCardActions({ claw })
    const { data: profile } = useProfile({ enabled: true })

    const isScheduledForDeletion = !!claw.deletionScheduledAt
    const hasActionItems =
        claw.status === clawStatus.running || claw.status === clawStatus.stopped

    return (
        <Fragment>
            <div
                onClick={() => onOpenClawSettings(claw.id)}
                className={`group/header relative mb-1.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isSelected ? 'bg-foreground/10' : 'hover:bg-foreground/5'
                }`}
            >
                <div className='relative shrink-0'>
                    <ClawAvatar size={CLAW_AVATAR_SIZE.SM} />
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
                </div>
                <div className='min-w-0 flex-1'>
                    {claw.name.length > TRUNCATE_LENGTHS.SIDEBAR_CLAW_NAME ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className='text-foreground truncate text-[13px] font-medium'>
                                    {claw.name.slice(
                                        0,
                                        TRUNCATE_LENGTHS.SIDEBAR_CLAW_NAME
                                    )}
                                    ...
                                </p>
                            </TooltipTrigger>
                            <TooltipContent>{claw.name}</TooltipContent>
                        </Tooltip>
                    ) : (
                        <p className='text-foreground truncate text-[13px] font-medium'>
                            {claw.name}
                        </p>
                    )}
                    {isScheduledForDeletion ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className='flex items-center gap-1'>
                                    <ClockIcon
                                        className='text-muted-foreground h-3 w-3 shrink-0'
                                        weight='fill'
                                    />
                                    <span className='text-muted-foreground truncate text-[11px]'>
                                        {t('dashboard.scheduledDeletionShort', {
                                            date: new Date(
                                                claw.deletionScheduledAt!
                                            ).toLocaleDateString(getLocale(), {
                                                month: 'short',
                                                day: 'numeric'
                                            })
                                        })}
                                    </span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side='bottom'>
                                <p>{t('dashboard.scheduledForDeletion')}</p>
                            </TooltipContent>
                        </Tooltip>
                    ) : claw.status === clawStatus.creating ||
                      claw.status === clawStatus.configuring ||
                      claw.status === clawStatus.awaitingPayment ? (
                        <p className='text-muted-foreground truncate text-[11px]'>
                            {statusConfig.label}
                        </p>
                    ) : claw.status === clawStatus.stopped ? (
                        <p className='text-muted-foreground truncate text-[11px]'>
                            {statusConfig.label}
                        </p>
                    ) : isLoadingAgents ? (
                        <p className='text-muted-foreground truncate text-[11px]'>
                            {t('playground.loadingAgents')}
                        </p>
                    ) : (
                        <p className='text-muted-foreground truncate text-[11px]'>
                            {agentCount === 1
                                ? t('playground.agentCount', {
                                      count: String(agentCount)
                                  })
                                : t('playground.agentCountPlural', {
                                      count: String(agentCount)
                                  })}
                        </p>
                    )}
                </div>
                {!readOnly && actions && (
                    <div
                        className='flex shrink-0 items-center gap-1'
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div>
                            <ClawCardDropdownMenu
                                claw={claw}
                                actions={actions}
                                isLoading={isMutating}
                                hasActionItems={hasActionItems}
                                isScheduledForDeletion={isScheduledForDeletion}
                                isAdmin={profile?.role === userRole.admin}
                                compact
                            />
                        </div>
                    </div>
                )}
            </div>
            {!readOnly && dialogsProps && (
                <ClawCardDialogsBundle {...dialogsProps} />
            )}
        </Fragment>
    )
}

export default ChatSidebarClawHeader