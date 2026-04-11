import type { FC, ReactNode } from 'react'
import type { PlaygroundClawNodeProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { clawStatus, userRole } from '@openclaw/shared'
import { getLocale, getBaseDomain, TRUNCATE_LENGTHS } from '@/lib'
import { useProfile, useClawCardActions } from '@/hooks'
import { getStatusConfig, generateSlug } from '@/lib/claw-utils'
import { ClockIcon, CircleNotchIcon, WarningIcon } from '@phosphor-icons/react'
import {
    ClawCardDropdownMenu,
    ClawCardDialogsBundle
} from '@/components/dashboard'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { Handle, Position } from '@xyflow/react'

const handleStyle = {
    bottom: 0,
    width: 0,
    height: 0,
    minWidth: 0,
    minHeight: 0,
    border: 'none',
    background: 'none',
    opacity: 0
}

const PlaygroundClawNode: FC<PlaygroundClawNodeProps> = ({
    data
}): ReactNode => {
    const { claw, isSelected, readOnly } = data
    const statusConfigs = getStatusConfig()
    const status = statusConfigs[claw.status] || statusConfigs.unknown

    const isRunning = claw.status === clawStatus.running
    const isUnreachable = claw.status === clawStatus.unreachable
    const canShowAgents = isRunning || isUnreachable

    const { actions, isMutating, dialogsProps } = useClawCardActions({ claw })

    const { data: profile } = useProfile({ enabled: true })

    const isScheduledForDeletion = !!claw.deletionScheduledAt
    const isPastDue = claw.subscriptionStatus === 'past_due'
    const hasActionItems =
        claw.status === clawStatus.running || claw.status === clawStatus.stopped

    return (
        <Fragment>
            <div
                className={`playground-node-enter bg-popover relative w-[280px] cursor-pointer rounded-xl border ${
                    isSelected
                        ? 'border-[#ef5350]/50 shadow-[0_0_20px_rgba(239,83,80,0.15)]'
                        : !canShowAgents
                          ? 'border-border opacity-50'
                          : 'border-border'
                } ${isRunning && !isSelected ? 'shadow-[0_0_30px_rgba(239,83,80,0.08)]' : ''}`}
            >
                <div className='border-border flex items-center gap-2 border-b px-4 py-3'>
                    <div className='flex flex-1 items-center gap-2 overflow-hidden'>
                        {claw.name.length > TRUNCATE_LENGTHS.NODE_CLAW_NAME ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className='text-foreground truncate text-sm font-semibold'>
                                        {claw.name.slice(
                                            0,
                                            TRUNCATE_LENGTHS.NODE_CLAW_NAME
                                        )}
                                        ...
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>{claw.name}</TooltipContent>
                            </Tooltip>
                        ) : (
                            <span className='text-foreground truncate text-sm font-semibold'>
                                {claw.name}
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
                    {!readOnly && actions && (
                        <div
                            className='flex shrink-0 items-center'
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
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
                    )}
                </div>

                {canShowAgents && (
                    <div className='px-4 py-3'>
                        {claw.status === clawStatus.running && (
                            <p className='text-muted-foreground mb-2 truncate text-xs'>
                                {claw.subdomain || generateSlug(claw.id)}.
                                {getBaseDomain()}
                            </p>
                        )}

                        <div className='flex items-center gap-2'>
                            {isUnreachable && (
                                <div className='bg-muted-foreground/10 flex items-center gap-1.5 rounded-md px-2 py-1'>
                                    <span className='text-muted-foreground text-xs'>
                                        {t('playground.offline')}
                                    </span>
                                </div>
                            )}
                            {isPastDue && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className='flex items-center gap-1.5 rounded-md bg-orange-500/10 px-2 py-1'>
                                            <WarningIcon
                                                className='h-3 w-3 text-orange-500'
                                                weight='fill'
                                            />
                                            <span className='text-xs text-orange-500'>
                                                {t('dashboard.pastDue')}
                                            </span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side='top'>
                                        <p>
                                            {t('dashboard.pastDueDescription')}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {isScheduledForDeletion && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className='bg-muted-foreground/10 flex items-center gap-1.5 rounded-md px-2 py-1'>
                                            <ClockIcon
                                                className='text-muted-foreground h-3 w-3'
                                                weight='fill'
                                            />
                                            <span className='text-muted-foreground text-xs'>
                                                {t(
                                                    'dashboard.scheduledDeletionShort',
                                                    {
                                                        date: new Date(
                                                            claw.deletionScheduledAt!
                                                        ).toLocaleDateString(
                                                            getLocale(),
                                                            {
                                                                month: 'short',
                                                                day: 'numeric'
                                                            }
                                                        )
                                                    }
                                                )}
                                            </span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side='top'>
                                        <p>
                                            {t(
                                                'dashboard.scheduledForDeletion'
                                            )}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    </div>
                )}
                {!canShowAgents && isPastDue && (
                    <div className='px-4 py-3'>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className='flex items-center gap-1.5 rounded-md bg-orange-500/10 px-2 py-1'>
                                    <WarningIcon
                                        className='h-3 w-3 text-orange-500'
                                        weight='fill'
                                    />
                                    <span className='text-xs text-orange-500'>
                                        {t('dashboard.pastDue')}
                                    </span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side='top'>
                                <p>{t('dashboard.pastDueDescription')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                )}
                {!canShowAgents && isScheduledForDeletion && (
                    <div className='px-4 py-3'>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className='bg-muted-foreground/10 flex items-center gap-1.5 rounded-md px-2 py-1'>
                                    <ClockIcon
                                        className='text-muted-foreground h-3 w-3'
                                        weight='fill'
                                    />
                                    <span className='text-muted-foreground text-xs'>
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
                            <TooltipContent side='top'>
                                <p>{t('dashboard.scheduledForDeletion')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                )}

                <Handle
                    type='source'
                    position={Position.Bottom}
                    isConnectable={false}
                    style={handleStyle}
                />
            </div>
            {dialogsProps && <ClawCardDialogsBundle {...dialogsProps} />}
        </Fragment>
    )
}

export default PlaygroundClawNode