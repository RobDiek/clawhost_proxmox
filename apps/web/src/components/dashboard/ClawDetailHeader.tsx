import type { FC, ReactNode } from 'react'
import type { ClawDetailHeaderProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import {
    XIcon,
    ArrowSquareOutIcon,
    PlayIcon,
    StopIcon,
    ArrowsClockwiseIcon
} from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'
import { clawStatus, userRole } from '@openclaw/shared'
import { getBaseDomain, TRUNCATE_LENGTHS } from '@/lib'
import { generateSlug } from '@/lib/claw-utils'
import { ClawAvatar } from '@/components/shared'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { useProfile, useClawCardActions } from '@/hooks'
import {
    ClawCardDropdownMenu,
    ClawCardDialogsBundle,
    HeaderActionButton
} from '@/components/dashboard'

const ClawDetailHeader: FC<ClawDetailHeaderProps> = ({
    claw,
    onClose,
    fullScreen
}): ReactNode => {
    const { actions, isMutating, dialogsProps } = useClawCardActions({ claw })
    const { data: profile } = useProfile({ enabled: true })

    const isScheduledForDeletion =
        !!claw.deletionScheduledAt &&
        new Date(claw.deletionScheduledAt) > new Date()
    const hasActionItems =
        claw.status === clawStatus.running || claw.status === clawStatus.stopped

    return (
        <Fragment>
            <div className='border-border flex items-center justify-between border-b px-3 p-2.5'>
                <div className='flex items-center gap-2.5'>
                    <ClawAvatar emoji={claw.emoji} emojiColor={claw.emojiColor} />
                    <div className='space-y-px'>
                        <h3 className='text-foreground text-sm font-semibold leading-tight'>
                            {claw.name.length > TRUNCATE_LENGTHS.PANEL_NAME ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span>
                                            {claw.name.slice(
                                                0,
                                                TRUNCATE_LENGTHS.PANEL_NAME
                                            )}
                                            ...
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>{claw.name}</TooltipContent>
                                </Tooltip>
                            ) : (
                                <span>{claw.name}</span>
                            )}
                        </h3>
                        {claw.status !== clawStatus.configuring &&
                            claw.status !== clawStatus.awaitingPayment && (
                                <a
                                    href={`https://${claw.subdomain || generateSlug(claw.id)}.${getBaseDomain()}${claw.gatewayToken ? `/?token=${claw.gatewayToken}` : ''}`}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='text-muted-foreground hover:text-foreground/80 flex items-center gap-1 truncate text-xs leading-tight transition-colors'
                                >
                                    <ArrowSquareOutIcon className='h-3 w-3 shrink-0' />
                                    {claw.subdomain || generateSlug(claw.id)}.
                                    {getBaseDomain()}
                                </a>
                            )}
                    </div>
                </div>
                <div className='flex items-center gap-1.5'>
                    {actions && hasActionItems && (
                        <div className='flex items-center gap-1'>
                            {claw.status === clawStatus.stopped && (
                                <HeaderActionButton
                                    icon={PlayIcon}
                                    label={t('dashboard.startServer')}
                                    onClick={actions.onStart}
                                    disabled={isMutating}
                                />
                            )}
                            {claw.status === clawStatus.running && (
                                <HeaderActionButton
                                    icon={StopIcon}
                                    label={t('dashboard.stopServer')}
                                    onClick={actions.onShowStopModal}
                                    disabled={isMutating}
                                />
                            )}
                            {claw.status === clawStatus.running && (
                                <HeaderActionButton
                                    icon={ArrowsClockwiseIcon}
                                    label={t('dashboard.restartServer')}
                                    onClick={actions.onShowRestartModal}
                                    disabled={isMutating}
                                />
                            )}
                        </div>
                    )}
                    {actions && (
                        <div className={fullScreen ? 'md:hidden' : ''}>
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
                    <button
                        onClick={onClose}
                        className={`text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-lg p-1.5 transition-colors ${fullScreen ? 'md:hidden' : ''}`}
                    >
                        <XIcon className='h-4 w-4' weight='bold' />
                    </button>
                </div>
            </div>
            {dialogsProps && <ClawCardDialogsBundle {...dialogsProps} />}
        </Fragment>
    )
}

export default ClawDetailHeader