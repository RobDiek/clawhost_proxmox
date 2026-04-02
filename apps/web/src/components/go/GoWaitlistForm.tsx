import type { FC, ReactNode } from 'react'
import type { GoWaitlistFormProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Button, Input } from '@/components/ui'
import {
    EnvelopeSimpleIcon,
    CircleNotchIcon,
    CheckCircleIcon,
    BellIcon
} from '@phosphor-icons/react'

const GoWaitlistForm: FC<GoWaitlistFormProps> = ({
    user,
    authLoading,
    hasJoined,
    isJoining,
    isCheckingStatus,
    waitlistEmail,
    isValidEmail,
    onWaitlistEmailChange,
    onJoinWaitlist,
    onEmailSubmit,
    loggedInClassName,
    guestClassName
}): ReactNode => {
    if (authLoading) return null

    if (user) {
        return (
            <div
                className={
                    loggedInClassName || 'flex flex-col gap-2 sm:flex-row'
                }
            >
                <div className='relative'>
                    <EnvelopeSimpleIcon className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40' />
                    <Input
                        type='email'
                        readOnly
                        value={user.email || ''}
                        className='h-10 w-full rounded-lg border-white/20 bg-white/5 pl-9 text-white placeholder:text-white/40 sm:w-60'
                    />
                </div>
                <Button
                    size='lg'
                    disabled={hasJoined || isJoining || isCheckingStatus}
                    onClick={() => onJoinWaitlist(user.email!)}
                    className='gap-2 border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] px-6 font-semibold text-white'
                >
                    {isJoining || isCheckingStatus ? (
                        <CircleNotchIcon className='h-5 w-5 animate-spin' />
                    ) : hasJoined ? (
                        <CheckCircleIcon className='h-5 w-5' weight='bold' />
                    ) : (
                        <BellIcon className='h-5 w-5' weight='bold' />
                    )}
                    {hasJoined ? t('go.joinedWaitlist') : t('go.joinWaitlist')}
                </Button>
            </div>
        )
    }

    return (
        <form
            onSubmit={onEmailSubmit}
            className={guestClassName || 'flex flex-col gap-2 sm:flex-row'}
        >
            <div className='relative'>
                <EnvelopeSimpleIcon className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40' />
                <Input
                    type='email'
                    required
                    disabled={hasJoined}
                    value={waitlistEmail}
                    onChange={(e) => onWaitlistEmailChange(e.target.value)}
                    placeholder={t('go.waitlistEmailPlaceholder')}
                    className='h-10 w-full rounded-lg border-white/20 bg-white/5 pl-9 text-white placeholder:text-white/40 sm:w-60'
                />
            </div>
            <Button
                type='submit'
                size='lg'
                disabled={hasJoined || isJoining || !isValidEmail}
                className='gap-2 border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] px-6 font-semibold text-white'
            >
                {isJoining ? (
                    <CircleNotchIcon className='h-5 w-5 animate-spin' />
                ) : hasJoined ? (
                    <CheckCircleIcon className='h-5 w-5' weight='bold' />
                ) : null}
                {hasJoined ? t('go.joinedWaitlist') : t('go.joinWaitlist')}
            </Button>
        </form>
    )
}

export default GoWaitlistForm