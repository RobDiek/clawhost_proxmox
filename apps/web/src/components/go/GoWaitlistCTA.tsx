import type { FC, ReactNode } from 'react'

import { useState, useEffect, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { useAuth } from '@/lib/auth'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { api } from '@/lib'
import { Button, Input } from '@/components/ui'
import {
    EnvelopeSimpleIcon,
    CircleNotchIcon,
    CheckCircleIcon,
    BellIcon
} from '@phosphor-icons/react'

const GoWaitlistCTA: FC = (): ReactNode => {
    const { user, loading: authLoading } = useAuth()
    const showToast = useUIStore((s) => s.showToast)
    const [hasJoined, setHasJoined] = useState(false)
    const [isJoining, setIsJoining] = useState(false)
    const [isCheckingStatus, setIsCheckingStatus] = useState(false)
    const [waitlistEmail, setWaitlistEmail] = useState('')

    useEffect(() => {
        setHasJoined(false)
        setWaitlistEmail('')
        setIsCheckingStatus(false)
        if (authLoading || !user?.email) return
        setIsCheckingStatus(true)
        api.checkWaitlistStatus(user.email)
            .then((res) => {
                if (res.joined) setHasJoined(true)
            })
            .catch(() => {})
            .finally(() => setIsCheckingStatus(false))
    }, [user?.email, authLoading])

    const handleJoinWaitlist = useCallback(
        async (email: string) => {
            if (!email || isJoining || hasJoined) return
            setIsJoining(true)
            try {
                const res = await api.joinWaitlist(email)
                setHasJoined(true)
                if (res.alreadyJoined) {
                    showToast(
                        t('go.waitlistAlreadyJoinedToast'),
                        TOAST_TYPE.INFO
                    )
                }
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : t('go.waitlistFailedToast')
                showToast(message, TOAST_TYPE.ERROR)
            } finally {
                setIsJoining(false)
            }
        },
        [isJoining, hasJoined, showToast]
    )

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(waitlistEmail.trim())

    const handleEmailSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault()
            if (!isValidEmail) return
            handleJoinWaitlist(waitlistEmail.trim())
        },
        [waitlistEmail, isValidEmail, handleJoinWaitlist]
    )

    if (authLoading) return null

    if (user) {
        return (
            <div className='flex flex-col gap-2 sm:flex-row'>
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
                    onClick={() => handleJoinWaitlist(user.email!)}
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
        <form onSubmit={handleEmailSubmit} className='flex gap-2'>
            <div className='relative'>
                <EnvelopeSimpleIcon className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40' />
                <Input
                    type='email'
                    required
                    disabled={hasJoined}
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
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

export default GoWaitlistCTA