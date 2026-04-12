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
import { clawStatus } from '@openclaw/shared'
import { getBaseDomain, TRUNCATE_LENGTHS } from '@/lib'
import { generateSlug, getStatusConfig } from '@/lib/claw-utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { useClawCardActions } from '@/hooks'
import {
    ClawCardDialogsBundle,
    HeaderActionButton
} from '@/components/dashboard'

const ClawDetailHeader: FC<ClawDetailHeaderProps> = ({
    claw,
    onClose,
    fullScreen,
    versionDisplay
}): ReactNode => {
    const { actions, isMutating, dialogsProps } = useClawCardActions({ claw })

    const hasActionItems =
        claw.status === clawStatus.running || claw.status === clawStatus.stopped
    const statusConfigs = getStatusConfig()
    const statusConfig = statusConfigs[claw.status]

    return (
        <Fragment>
            <div className='border-border flex items-center justify-between border-b p-2.5 px-3.5'>
                <div className='flex items-center gap-2.5'>
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
                                <div className='text-muted-foreground flex items-center gap-1.5 text-xs leading-tight'>
                                    <a
                                        href={`https://${claw.subdomain || generateSlug(claw.id)}.${getBaseDomain()}${claw.gatewayToken ? `/?token=${claw.gatewayToken}` : ''}`}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='hover:text-foreground/80 flex items-center gap-1 truncate transition-colors'
                                    >
                                        <ArrowSquareOutIcon className='h-3 w-3 shrink-0' />
                                        {claw.subdomain || generateSlug(claw.id)}.
                                        {getBaseDomain()}
                                    </a>
                                    {versionDisplay && (
                                        <span className='flex items-center gap-1.5'>
                                            <span className='bg-muted-foreground/40 h-0.5 w-0.5 rounded-full' />
                                            <span>
                                                {versionDisplay}
                                            </span>
                                        </span>
                                    )}
                                </div>
                            )}
                    </div>
                </div>
                <div className='flex items-center gap-1.5'>
                    {statusConfig && (
                        <span
                            className={`border-border inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium leading-none ${statusConfig.bgColor}`}
                        >
                            <span
                                className={`h-1.5 w-1.5 rounded-full ${statusConfig.color} ${statusConfig.pulse ? 'animate-pulse' : ''}`}
                            />
                            {statusConfig.label}
                        </span>
                    )}
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