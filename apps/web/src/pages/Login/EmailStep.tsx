import type { FC, ReactNode } from 'react'
import type { EmailStepProps } from '@/ts/Interfaces'

import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { ROUTES } from '@/lib'
import { LOGIN_LOADING_METHOD, OAUTH_PROVIDER } from '@/lib/constants'
import { Button, Input, Label } from '@/components/ui'
import { GoogleIcon, GithubIcon } from '@/components/icons'
import { CircleNotchIcon } from '@phosphor-icons/react'

const EmailStep: FC<EmailStepProps> = ({
    email,
    setEmail,
    emailError,
    loadingMethod,
    cooldown,
    onSubmit,
    onOAuth
}): ReactNode => {
    return (
        <div className='border-border bg-foreground/[0.02] rounded-xl border p-8 backdrop-blur-sm'>
            <form onSubmit={onSubmit} className='space-y-5'>
                <div className='space-y-2'>
                    <Label htmlFor='email' className='text-foreground/80'>
                        {t('auth.emailAddress')}
                    </Label>
                    <Input
                        type='text'
                        id='email'
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t('auth.emailPlaceholder')}
                        disabled={!!loadingMethod}
                        className={`bg-foreground/5 text-foreground placeholder:text-muted-foreground h-11 ${
                            emailError
                                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                                : 'border-border focus:border-[#ef5350]/50 focus:ring-[#ef5350]/20'
                        }`}
                    />
                    {emailError && (
                        <p className='text-sm text-red-500'>{emailError}</p>
                    )}
                </div>

                <Button
                    type='submit'
                    size='lg'
                    className='w-full gap-2 border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] text-white hover:opacity-90'
                    disabled={!!loadingMethod || cooldown > 0}
                >
                    {loadingMethod === LOGIN_LOADING_METHOD.EMAIL && (
                        <CircleNotchIcon className='h-4 w-4 animate-spin' />
                    )}
                    {cooldown > 0
                        ? t('auth.resendIn', { seconds: String(cooldown) })
                        : t('auth.continueWithEmail')}
                </Button>

                <p className='text-muted-foreground text-center text-sm'>
                    {t('auth.otpDescription')}
                </p>
            </form>

            <div className='mt-6 flex items-center gap-3'>
                <div className='bg-foreground/10 h-px flex-1' />
                <span className='text-muted-foreground text-sm'>
                    {t('auth.or')}
                </span>
                <div className='bg-foreground/10 h-px flex-1' />
            </div>

            <div className='mt-6 space-y-3'>
                <button
                    onClick={() => onOAuth(OAUTH_PROVIDER.GOOGLE)}
                    disabled={!!loadingMethod}
                    className='border-border bg-foreground/5 text-foreground hover:bg-foreground/10 flex h-11 w-full items-center justify-center gap-3 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50'
                >
                    {loadingMethod === LOGIN_LOADING_METHOD.GOOGLE ? (
                        <CircleNotchIcon className='h-[18px] w-[18px] animate-spin' />
                    ) : (
                        <GoogleIcon />
                    )}
                    {t('auth.continueWithGoogle')}
                </button>
                <button
                    onClick={() => onOAuth(OAUTH_PROVIDER.GITHUB)}
                    disabled={!!loadingMethod}
                    className='border-border bg-foreground/5 text-foreground hover:bg-foreground/10 flex h-11 w-full items-center justify-center gap-3 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50'
                >
                    {loadingMethod === LOGIN_LOADING_METHOD.GITHUB ? (
                        <CircleNotchIcon className='h-[18px] w-[18px] animate-spin' />
                    ) : (
                        <GithubIcon />
                    )}
                    {t('auth.continueWithGithub')}
                </button>
            </div>

            <p className='text-muted-foreground mt-6 text-center text-xs'>
                {t('auth.agreementNotice')}{' '}
                <Link
                    to={ROUTES.TERMS}
                    className='text-muted-foreground hover:text-foreground underline'
                >
                    {t('auth.termsOfService')}
                </Link>{' '}
                {t('auth.andWord')}{' '}
                <Link
                    to={ROUTES.PRIVACY}
                    className='text-muted-foreground hover:text-foreground underline'
                >
                    {t('auth.privacyPolicy')}
                </Link>
            </p>
        </div>
    )
}

export default EmailStep