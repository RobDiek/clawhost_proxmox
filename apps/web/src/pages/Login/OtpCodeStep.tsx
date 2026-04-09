import type { FC, ReactNode } from 'react'
import type { OtpCodeStepProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { LOGIN_LOADING_METHOD } from '@/lib/constants'
import { Button } from '@/components/ui'
import {
    ArrowLeftIcon,
    CircleNotchIcon,
    EnvelopeIcon
} from '@phosphor-icons/react'

const CODE_LENGTH = 6

const OtpCodeStep: FC<OtpCodeStepProps> = ({
    email,
    code,
    codeError,
    isCodeComplete,
    loadingMethod,
    cooldown,
    inputRefs,
    onCodeChange,
    onCodeKeyDown,
    onVerify,
    onResend,
    onChangeEmail
}): ReactNode => {
    return (
        <div className='border-border bg-foreground/[0.02] rounded-xl border p-8 backdrop-blur-sm'>
            <button
                onClick={onChangeEmail}
                disabled={!!loadingMethod}
                className='text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 text-sm transition-colors disabled:opacity-50'
            >
                <ArrowLeftIcon className='h-4 w-4' />
            </button>

            <div className='text-center'>
                <div className='bg-foreground/5 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full'>
                    <EnvelopeIcon className='h-8 w-8 text-[#ef5350]' />
                </div>
                <h1 className='font-clash mb-2 text-2xl font-bold'>
                    {t('auth.checkYourEmailHeading')}
                </h1>
                <p className='text-muted-foreground mb-6 text-sm'>
                    {t('auth.codeSentTo')}{' '}
                    <span className='text-foreground font-medium'>{email}</span>
                </p>
            </div>

            <div className='mb-6 flex justify-center gap-2'>
                {code.map((digit, index) => (
                    <input
                        key={index}
                        ref={(ref) => {
                            inputRefs.current[index] = ref
                        }}
                        type='text'
                        inputMode='numeric'
                        maxLength={index === 0 ? CODE_LENGTH : 1}
                        value={digit}
                        onChange={(e) => onCodeChange(e.target.value, index)}
                        onKeyDown={(e) => onCodeKeyDown(e.key, index)}
                        disabled={!!loadingMethod}
                        className={`font-clash bg-foreground/5 text-foreground h-12 w-11 rounded-lg border text-center text-lg font-bold focus:outline-none focus:ring-1 ${
                            codeError
                                ? 'border-red-500 focus:ring-red-500/20'
                                : digit
                                  ? 'border-[#ef5350] focus:ring-[#ef5350]/20'
                                  : 'border-border focus:border-[#ef5350]/50 focus:ring-[#ef5350]/20'
                        }`}
                    />
                ))}
            </div>

            <Button
                onClick={onVerify}
                size='lg'
                className='w-full gap-2 border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] text-white hover:opacity-90'
                disabled={!!loadingMethod || !isCodeComplete}
            >
                {loadingMethod === LOGIN_LOADING_METHOD.EMAIL && (
                    <CircleNotchIcon className='h-4 w-4 animate-spin' />
                )}
                {t('auth.verifyCode')}
            </Button>

            <button
                onClick={onResend}
                disabled={cooldown > 0 || !!loadingMethod}
                className='text-muted-foreground hover:text-foreground/80 mt-4 flex w-full items-center justify-center gap-2 text-sm transition-colors disabled:opacity-50'
            >
                {loadingMethod === LOGIN_LOADING_METHOD.RESEND ? (
                    <CircleNotchIcon className='h-3.5 w-3.5 animate-spin' />
                ) : null}
                {cooldown > 0
                    ? t('auth.resendIn', { seconds: String(cooldown) })
                    : t('auth.resendCode')}
            </button>
        </div>
    )
}

export default OtpCodeStep