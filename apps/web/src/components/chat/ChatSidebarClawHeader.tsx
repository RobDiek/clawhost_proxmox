import type { FC, ReactNode } from 'react'
import type { ChatSidebarClawHeaderProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { clawStatus, userRole } from '@openclaw/shared'
import {
    ArrowSquareOutIcon,
    ClockIcon,
    WarningIcon
} from '@phosphor-icons/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { getBaseDomain, getLocale, TRUNCATE_LENGTHS } from '@/lib'
import { generateSlug } from '@/lib/claw-utils'
import { CLAW_AVATAR_SIZE } from '@/lib/constants'
import { ClawAvatar } from '@/components/shared'
import { useProfile, useClawCardActions } from '@/hooks'
import {
    ClawCardDropdownMenu,
    ClawCardDialogsBundle
} from '@/components/dashboard'

const ChatSidebarClawHeader: FC<ChatSidebarClawHeaderProps> = ({
    claw,
    isSelected,
    statusConfig,
    readOnly,
    onOpenClawSettings
}): ReactNode => {
    const { actions, isMutating, dialogsProps } = useClawCardActions({ claw })
    const { data: profile } = useProfile({ enabled: true })

    const isScheduledForDeletion =
        !!claw.deletionScheduledAt &&
        new Date(claw.deletionScheduledAt) > new Date()
    const isPastDue = claw.subscriptionStatus === 'past_due'
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
                    <ClawAvatar emoji={claw.emoji} emojiColor={claw.emojiColor} size={CLAW_AVATAR_SIZE.SM} />
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
                    {isPastDue ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className='flex items-center gap-1'>
                                    <WarningIcon
                                        className='h-3 w-3 shrink-0 text-orange-500'
                                        weight='fill'
                                    />
                                    <span className='truncate text-[11px] text-orange-500'>
                                        {t('dashboard.pastDue')}
                                    </span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side='bottom'>
                                <p>{t('dashboard.pastDueDescription')}</p>
                            </TooltipContent>
                        </Tooltip>
                    ) : isScheduledForDeletion ? (
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
                    ) : claw.subscriptionStatus === 'canceled' ? (
                        <div className='flex items-center gap-1'>
                            <WarningIcon
                                className='h-3 w-3 shrink-0 text-red-500'
                                weight='fill'
                            />
                            <span className='truncate text-[11px] text-red-500'>
                                {t('dashboard.deletionFailed')}
                            </span>
                        </div>
                    ) : claw.status === clawStatus.running ? (
                        <p className='text-muted-foreground truncate text-[11px]'>
                            {(claw.subdomain || generateSlug(claw.id)) +
                                '.' +
                                getBaseDomain()}
                        </p>
                    ) : (
                        <p className='text-muted-foreground truncate text-[11px]'>
                            {statusConfig.label}
                        </p>
                    )}
                </div>
                {!readOnly && actions && (
                    <div
                        className='flex shrink-0 items-center gap-1'
                        onClick={(e) => e.stopPropagation()}
                    >
                        {claw.status === clawStatus.running && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => {
                                            const subdomain =
                                                claw.subdomain ||
                                                generateSlug(claw.id)
                                            const domain = `${subdomain}.${getBaseDomain()}`
                                            const url = `https://${domain}${claw.gatewayToken ? `/?token=${claw.gatewayToken}` : ''}`
                                            window.open(url, '_blank')
                                        }}
                                        className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground shrink-0 rounded-md p-1 transition-colors'
                                    >
                                        <ArrowSquareOutIcon className='h-3.5 w-3.5' />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side='bottom'>
                                    {t('dashboard.openControlPanel')}
                                </TooltipContent>
                            </Tooltip>
                        )}
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