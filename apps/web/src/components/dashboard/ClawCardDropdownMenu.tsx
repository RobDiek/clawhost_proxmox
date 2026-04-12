import type { FC, ReactNode } from 'react'
import type { ClawCardDropdownMenuProps } from '@/ts/Interfaces'

import { Fragment, useState, useEffect, useRef, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { clawStatus } from '@openclaw/shared'
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui'
import {
    TrashIcon,
    DotsThreeOutlineIcon,
    CircleNotchIcon,
    ClockCountdownIcon,
    ArrowCounterClockwiseIcon,
    ArrowSquareOutIcon,
    CreditCardIcon
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
    const [open, setOpen] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)

    const handleClose = useCallback(() => setOpen(false), [])

    useEffect(() => {
        if (!open) return

        const scrollableParents: HTMLElement[] = []
        let el = triggerRef.current?.parentElement
        while (el) {
            const style = getComputedStyle(el)
            if (
                style.overflow === 'auto' ||
                style.overflow === 'scroll' ||
                style.overflowY === 'auto' ||
                style.overflowY === 'scroll'
            )
                scrollableParents.push(el)
            el = el.parentElement
        }

        scrollableParents.forEach((parent) =>
            parent.addEventListener('scroll', handleClose, { passive: true })
        )

        return () => {
            scrollableParents.forEach((parent) =>
                parent.removeEventListener('scroll', handleClose)
            )
        }
    }, [open, handleClose])

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
        <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                {compact ? (
                    <button
                        ref={triggerRef}
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
                        ref={triggerRef}
                        variant='ghost'
                        size='icon'
                        aria-label={t('dashboard.clawActions')}
                    >
                        <DotsThreeOutlineIcon className='h-5 w-5' />
                    </Button>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' collisionPadding={8}>
                {claw.ip && (
                    <Fragment>
                        {claw.polarSubscriptionId && (
                            <DropdownMenuItem
                                onClick={actions.onUpdatePayment}
                                className='text-orange-600 focus:text-orange-600 dark:text-orange-400 dark:focus:text-orange-400'
                            >
                                <CreditCardIcon className='mr-2 h-4 w-4' />
                                {claw.subscriptionStatus === 'past_due'
                                    ? t('dashboard.updatePayment')
                                    : t('billing.manageBilling')}
                            </DropdownMenuItem>
                        )}
                    </Fragment>
                )}
                {(hasActionItems || claw.ip) && <DropdownMenuSeparator />}
                {claw.status === clawStatus.awaitingPayment ? (
                    <Fragment>
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
                    </Fragment>
                ) : isScheduledForDeletion ? (
                    <Fragment>
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
                    </Fragment>
                ) : (
                    <Fragment>
                        {claw.status === clawStatus.creating &&
                            !claw.id.startsWith('pending-') && (
                                <Fragment>
                                    <DropdownMenuItem
                                        onClick={actions.onShowReinstallModal}
                                        disabled={isLoading}
                                    >
                                        <ArrowCounterClockwiseIcon className='mr-2 h-4 w-4' />
                                        {t('dashboard.reinstallInstance')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                </Fragment>
                            )}
                        <DropdownMenuItem
                            onClick={actions.onShowDeleteModal}
                            disabled={isLoading}
                            className='text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400'
                        >
                            <TrashIcon className='mr-2 h-4 w-4' />
                            {claw.id.startsWith('pending-') ||
                            claw.subscriptionStatus === 'canceled'
                                ? t('common.delete')
                                : t('dashboard.scheduleDeletion')}
                        </DropdownMenuItem>
                    </Fragment>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export default ClawCardDropdownMenu