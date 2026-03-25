import type { FC, ReactNode } from 'react'
import type { ClawCardDropdownMenuProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { clawProvider, clawStatus } from '@openclaw/shared'
import { getBaseDomain } from '@/lib'
import { generateSlug } from '@/lib/claw-utils'
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui'
import {
    PlayIcon,
    SquareIcon,
    ArrowClockwiseIcon,
    TrashIcon,
    DotsThreeOutlineIcon,
    TerminalIcon,
    CircleNotchIcon,
    ClockCountdownIcon,
    FolderSimpleIcon,
    ArrowsClockwiseIcon,
    ArrowCounterClockwiseIcon,
    ExportIcon,
    ArrowSquareOutIcon
} from '@phosphor-icons/react'

const ClawCardDropdownMenu: FC<ClawCardDropdownMenuProps> = ({
    claw,
    actions,
    isLoading,
    hasActionItems,
    isScheduledForDeletion,
    isAdmin,
    compact
}): ReactNode => {
    if (isLoading) {
        return compact ? (
            <button
                className='text-muted-foreground shrink-0 rounded-md p-1'
                disabled
                aria-label={t('common.loading')}
            >
                <CircleNotchIcon className='h-3.5 w-3.5 animate-spin' />
            </button>
        ) : (
            <Button
                variant='ghost'
                size='icon'
                disabled
                aria-label={t('common.loading')}
            >
                <CircleNotchIcon className='h-5 w-5 animate-spin' />
            </Button>
        )
    }

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                {compact ? (
                    <button
                        aria-label={t('dashboard.clawActions')}
                        className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground shrink-0 rounded-md p-1 transition-colors'
                    >
                        <DotsThreeOutlineIcon
                            className='h-3.5 w-3.5'
                            weight='bold'
                        />
                    </button>
                ) : (
                    <Button
                        variant='ghost'
                        size='icon'
                        aria-label={t('dashboard.clawActions')}
                    >
                        <DotsThreeOutlineIcon className='h-5 w-5' />
                    </Button>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' collisionPadding={8}>
                {claw.status === clawStatus.stopped && (
                    <DropdownMenuItem
                        onClick={actions.onStart}
                        disabled={isLoading}
                    >
                        <PlayIcon className='mr-2 h-4 w-4' />
                        {t('dashboard.start')}
                    </DropdownMenuItem>
                )}
                {claw.status === clawStatus.running && (
                    <>
                        <DropdownMenuItem
                            onClick={() => {
                                let url: string
                                if (
                                    claw.provider === clawProvider.local &&
                                    claw.port
                                ) {
                                    url = `http://127.0.0.1:${claw.port}${claw.gatewayToken ? `/?token=${claw.gatewayToken}` : ''}`
                                } else {
                                    const subdomain =
                                        claw.subdomain || generateSlug(claw.id)
                                    const domain = `${subdomain}.${getBaseDomain()}`
                                    url = `https://${domain}${claw.gatewayToken ? `/?token=${claw.gatewayToken}` : ''}`
                                }
                                window.open(url, '_blank')
                            }}
                        >
                            <ArrowSquareOutIcon className='mr-2 h-4 w-4' />
                            {t('dashboard.openControlPanel')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={actions.onShowStopModal}
                            disabled={isLoading}
                        >
                            <SquareIcon className='mr-2 h-4 w-4' />
                            {t('dashboard.stop')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={actions.onShowRestartModal}
                            disabled={isLoading}
                        >
                            <ArrowClockwiseIcon className='mr-2 h-4 w-4' />
                            {t('dashboard.restart')}
                        </DropdownMenuItem>
                    </>
                )}
                {claw.provider !== clawProvider.local && claw.ip && (
                    <>
                        {hasActionItems && <DropdownMenuSeparator />}
                        <DropdownMenuItem onClick={actions.onShowCredentials}>
                            <TerminalIcon className='mr-2 h-4 w-4' />
                            {t('dashboard.viewServerCredentials')}
                        </DropdownMenuItem>
                    </>
                )}
                {claw.ip && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={actions.onShowConfig}>
                            <FolderSimpleIcon className='mr-2 h-4 w-4' />
                            {t('dashboard.fileExplorer')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={actions.onExport}>
                            <ExportIcon className='mr-2 h-4 w-4' />
                            {t('dashboard.exportData')}
                        </DropdownMenuItem>
                        {claw.provider !== clawProvider.local && isAdmin && (
                            <DropdownMenuItem
                                onClick={actions.onUpdateInstance}
                                disabled={isLoading}
                            >
                                <ArrowsClockwiseIcon className='mr-2 h-4 w-4' />
                                {t('dashboard.updateInstance')}
                            </DropdownMenuItem>
                        )}
                        {claw.provider !== clawProvider.local && (
                            <DropdownMenuItem
                                onClick={actions.onShowReinstallModal}
                                disabled={isLoading}
                            >
                                <ArrowCounterClockwiseIcon className='mr-2 h-4 w-4' />
                                {t('dashboard.reinstallInstance')}
                            </DropdownMenuItem>
                        )}
                    </>
                )}
                {(hasActionItems || claw.ip) && <DropdownMenuSeparator />}
                {claw.status === clawStatus.awaitingPayment ? (
                    <>
                        {claw.checkoutUrl && (
                            <DropdownMenuItem
                                onClick={() => actions.onResumeCheckout()}
                            >
                                <ArrowSquareOutIcon className='mr-2 h-4 w-4' />
                                {t('dashboard.resumeCheckout')}
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                            onClick={actions.onCancelPending}
                            disabled={isLoading}
                            className='text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400'
                        >
                            <TrashIcon className='mr-2 h-4 w-4' />
                            {t('dashboard.cancelPurchase')}
                        </DropdownMenuItem>
                    </>
                ) : claw.provider === clawProvider.local ? (
                    <DropdownMenuItem
                        onClick={actions.onShowDeleteModal}
                        disabled={isLoading}
                        className='text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400'
                    >
                        <TrashIcon className='mr-2 h-4 w-4' />
                        {t('common.delete')}
                    </DropdownMenuItem>
                ) : isScheduledForDeletion ? (
                    <>
                        <DropdownMenuItem
                            onClick={actions.onCancelDeletion}
                            className='text-orange-600 focus:text-orange-600 dark:text-orange-400 dark:focus:text-orange-400'
                        >
                            <ClockCountdownIcon className='mr-2 h-4 w-4' />
                            {t('dashboard.cancelDeletion')}
                        </DropdownMenuItem>
                        {isAdmin && (
                            <DropdownMenuItem
                                onClick={actions.onShowHardDeleteModal}
                                disabled={isLoading}
                                className='text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400'
                            >
                                <TrashIcon className='mr-2 h-4 w-4' />
                                {t('dashboard.hardDelete')}
                            </DropdownMenuItem>
                        )}
                    </>
                ) : (
                    <>
                        {claw.status === clawStatus.creating &&
                            !claw.id.startsWith('pending-') && (
                                <>
                                    <DropdownMenuItem
                                        onClick={actions.onShowReinstallModal}
                                        disabled={isLoading}
                                    >
                                        <ArrowCounterClockwiseIcon className='mr-2 h-4 w-4' />
                                        {t('dashboard.reinstallInstance')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                </>
                            )}
                        <DropdownMenuItem
                            onClick={actions.onShowDeleteModal}
                            disabled={isLoading}
                            className='text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400'
                        >
                            <TrashIcon className='mr-2 h-4 w-4' />
                            {claw.id.startsWith('pending-')
                                ? t('common.delete')
                                : t('dashboard.scheduleDeletion')}
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export default ClawCardDropdownMenu