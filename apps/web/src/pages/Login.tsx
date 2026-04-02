import type { FC, ReactNode } from 'react'
import type { LoginLoadingMethod, OAuthProvider } from '@/ts/Types'

import { Fragment, useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { useAuth } from '@/lib/auth'
import { useNetworkStatus } from '@/hooks'
import { useUIStore } from '@/lib/store'
import {
    LOGIN_LOADING_METHOD,
    OAUTH_PROVIDER,
    TOAST_TYPE
} from '@/lib/constants'
import { ROUTES } from '@/lib'
import { Button, Input, Label } from '@/components/ui'
import {
    AnnouncementBanner,
    Logo,
    NetworkStatus,
    PageBackground,
    PageTitle,
    ProductHuntBanner
} from '@/components'
import {
    EnvelopeIcon,
    CircleNotchIcon,
    ArrowLeftIcon
} from '@phosphor-icons/react'
import STORAGE_KEYS from '@/lib/storageKeys'

const COOLDOWN_KEY = STORAGE_KEYS.OTP_SENT_AT
const COOLDOWN_DURATION = 60
const CODE_LENGTH = 6
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const getRemainingCooldown = (): number => {
    const sentAt = localStorage.getItem(COOLDOWN_KEY)
    if (!sentAt) return 0
    const elapsed = Math.floor((Date.now() - Number(sentAt)) / 1000)
    return Math.max(0, COOLDOWN_DURATION - elapsed)
}

const Login: FC = (): ReactNode => {
    const [email, setEmail] = useState('')
    const [step, setStep] = useState<'email' | 'code'>('email')
    const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''))
    const [loadingMethod, setLoadingMethod] = useState<LoginLoadingMethod>(null)
    const [cooldown, setCooldown] = useState(getRemainingCooldown)
    const [codeError, setCodeError] = useState(false)
    const [emailError, setEmailError] = useState('')
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])
    const pastedRef = useRef(false)
    const {
        user,
        loading: authLoading,
        sendOtp,
        verifyOtp,
        signInWithGoogle,
        signInWithGithub,
        isLocal
    } = useAuth()
    const { showToast } = useUIStore()
    const isOffline = useNetworkStatus()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const planParam = searchParams.get('plan')
    const deployParam = searchParams.get('deploy')
    const providerParam = searchParams.get('provider')

    const getRedirectUrl = () => {
        if (planParam) {
            const providerSuffix = providerParam
                ? `&provider=${providerParam}`
                : ''
            return `${ROUTES.CLAWS}?plan=${planParam}${providerSuffix}`
        }
        if (deployParam) return `${ROUTES.CLAWS}?deploy=true`
        return ROUTES.CLAWS
    }

    useEffect(() => {
        if (user) {
            navigate(getRedirectUrl())
        }
    }, [user, navigate])

    useEffect(() => {
        if (cooldown <= 0) return
        const interval = setInterval(() => {
            setCooldown(getRemainingCooldown())
        }, 1000)
        return () => clearInterval(interval)
    }, [cooldown])

    const startCooldown = useCallback(() => {
        localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
        setCooldown(COOLDOWN_DURATION)
    }, [])

    const handleSendOtp = useCallback(async () => {
        if (loadingMethod || cooldown > 0) return

        const trimmed = email.trim()
        if (
            !trimmed ||
            !EMAIL_REGEX.test(trimmed) ||
            trimmed.length > inputValidation.EMAIL.MAX
        ) {
            setEmailError(t('auth.invalidEmailFormat'))
            return
        }

        setEmailError('')
        setLoadingMethod(LOGIN_LOADING_METHOD.EMAIL)
        try {
            await sendOtp(email.trim())
            startCooldown()
            setStep('code')
            setCode(Array(CODE_LENGTH).fill(''))
            setCodeError(false)
            setTimeout(() => inputRefs.current[0]?.focus(), 100)
        } catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : t('errors.somethingWentWrong')
            showToast(message, TOAST_TYPE.ERROR)
        } finally {
            setLoadingMethod(null)
        }
    }, [email, loadingMethod, cooldown, sendOtp, startCooldown, showToast])

    const handleVerifyOtp = useCallback(
        async (fullCode: string) => {
            if (loadingMethod) return
            setLoadingMethod(LOGIN_LOADING_METHOD.EMAIL)
            setCodeError(false)
            try {
                await verifyOtp(email.trim(), fullCode)
            } catch (err: unknown) {
                const message =
                    err instanceof Error ? err.message : t('auth.invalidCode')
                showToast(message, TOAST_TYPE.ERROR)
                setCodeError(true)
                setCode(Array(CODE_LENGTH).fill(''))
                inputRefs.current[0]?.focus()
            } finally {
                setLoadingMethod(null)
            }
        },
        [email, loadingMethod, verifyOtp, showToast]
    )

    useEffect(() => {
        if (pastedRef.current && code.every((d) => d !== '')) {
            pastedRef.current = false
            handleVerifyOtp(code.join(''))
        }
    }, [code, handleVerifyOtp])

    const handleCodeChange = useCallback(
        (value: string, index: number) => {
            if (!/^\d*$/.test(value)) return

            const newCode = [...code]

            if (value.length > 1) {
                const digits = value.split('').slice(0, CODE_LENGTH)
                digits.forEach((digit, i) => {
                    if (index + i < CODE_LENGTH) {
                        newCode[index + i] = digit
                    }
                })
                if (newCode.every((d) => d !== '')) {
                    pastedRef.current = true
                }
                setCode(newCode)
                setCodeError(false)
                const nextIndex = Math.min(
                    index + digits.length,
                    CODE_LENGTH - 1
                )
                inputRefs.current[nextIndex]?.focus()
                return
            }

            newCode[index] = value
            setCode(newCode)
            setCodeError(false)

            if (value && index < CODE_LENGTH - 1) {
                inputRefs.current[index + 1]?.focus()
            }
        },
        [code]
    )

    const isCodeComplete = code.every((d) => d !== '')

    const handleCodeKeyDown = useCallback(
        (key: string, index: number) => {
            if (key === 'Enter' && isCodeComplete) {
                handleVerifyOtp(code.join(''))
                return
            }
            if (key === 'Backspace' && !code[index] && index > 0) {
                const newCode = [...code]
                newCode[index - 1] = ''
                setCode(newCode)
                inputRefs.current[index - 1]?.focus()
            }
        },
        [code, isCodeComplete, handleVerifyOtp]
    )

    const handleOAuth = useCallback(
        async (provider: OAuthProvider) => {
            if (loadingMethod) return
            setLoadingMethod(provider)
            try {
                if (provider === OAUTH_PROVIDER.GOOGLE) {
                    await signInWithGoogle()
                } else {
                    await signInWithGithub()
                }
            } catch (err: unknown) {
                const message =
                    err instanceof Error
                        ? err.message
                        : t('errors.somethingWentWrong')
                showToast(message, TOAST_TYPE.ERROR)
            } finally {
                setLoadingMethod(null)
            }
        },
        [loadingMethod, signInWithGoogle, signInWithGithub, showToast]
    )

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        handleSendOtp()
    }

    const handleChangeEmail = useCallback(() => {
        setStep('email')
        setCode(Array(CODE_LENGTH).fill(''))
        setCodeError(false)
    }, [])

    const handleResend = useCallback(async () => {
        if (cooldown > 0 || loadingMethod) return
        setLoadingMethod(LOGIN_LOADING_METHOD.RESEND)
        try {
            await sendOtp(email.trim())
            startCooldown()
            setCode(Array(CODE_LENGTH).fill(''))
            setCodeError(false)
            inputRefs.current[0]?.focus()
        } catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : t('errors.somethingWentWrong')
            showToast(message, TOAST_TYPE.ERROR)
        } finally {
            setLoadingMethod(null)
        }
    }, [cooldown, loadingMethod, email, sendOtp, startCooldown, showToast])

    if (authLoading || user) {
        return (
            <div className='bg-background text-foreground relative flex min-h-screen items-center justify-center px-4'>
                <PageBackground />
                <CircleNotchIcon className='text-foreground/50 h-8 w-8 animate-spin' />
            </div>
        )
    }

    return (
        <div
            className={`bg-background text-foreground ${isLocal ? 'fixed inset-0 flex flex-col overflow-hidden' : 'relative min-h-screen'}`}
        >
            {isOffline ? (
                <NetworkStatus />
            ) : (
                <Fragment>
                    <ProductHuntBanner />
                    {!isLocal && <AnnouncementBanner />}
                </Fragment>
            )}
            <div className='flex min-h-screen items-center justify-center px-4'>
                <PageTitle
                    title={
                        step === 'email'
                            ? t('auth.signIn')
                            : t('auth.checkYourEmail')
                    }
                    description={t('auth.signInDescription')}
                    noIndex
                />
                <PageBackground />
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className='relative w-full max-w-md'
                >
                    <div className='mb-8 flex flex-col items-center'>
                        <div className='mb-6'>
                            <Logo />
                        </div>
                        <p className='text-muted-foreground text-center'>
                            {t('auth.signInToDeployOpenClaw')}
                        </p>
                    </div>

                    {step === 'email' ? (
                        <div className='border-border bg-foreground/[0.02] rounded-xl border p-8 backdrop-blur-sm'>
                            <form onSubmit={handleSubmit} className='space-y-5'>
                                <div className='space-y-2'>
                                    <Label
                                        htmlFor='email'
                                        className='text-foreground/80'
                                    >
                                        {t('auth.emailAddress')}
                                    </Label>
                                    <Input
                                        type='text'
                                        id='email'
                                        value={email}
                                        onChange={(e) =>
                                            setEmail(e.target.value)
                                        }
                                        placeholder={t('auth.emailPlaceholder')}
                                        disabled={!!loadingMethod}
                                        className={`bg-foreground/5 text-foreground placeholder:text-muted-foreground h-11 ${
                                            emailError
                                                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                                                : 'border-border focus:border-[#ef5350]/50 focus:ring-[#ef5350]/20'
                                        }`}
                                    />
                                    {emailError && (
                                        <p className='text-sm text-red-500'>
                                            {emailError}
                                        </p>
                                    )}
                                </div>

                                <Button
                                    type='submit'
                                    size='lg'
                                    className='w-full gap-2 border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] text-white hover:opacity-90'
                                    disabled={!!loadingMethod || cooldown > 0}
                                >
                                    {loadingMethod ===
                                        LOGIN_LOADING_METHOD.EMAIL && (
                                        <CircleNotchIcon className='h-4 w-4 animate-spin' />
                                    )}
                                    {cooldown > 0
                                        ? t('auth.resendIn', {
                                              seconds: String(cooldown)
                                          })
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
                                    onClick={() =>
                                        handleOAuth(OAUTH_PROVIDER.GOOGLE)
                                    }
                                    disabled={!!loadingMethod}
                                    className='border-border bg-foreground/5 text-foreground hover:bg-foreground/10 flex h-11 w-full items-center justify-center gap-3 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50'
                                >
                                    {loadingMethod ===
                                    LOGIN_LOADING_METHOD.GOOGLE ? (
                                        <CircleNotchIcon className='h-[18px] w-[18px] animate-spin' />
                                    ) : (
                                        <svg
                                            width='18'
                                            height='18'
                                            viewBox='0 0 24 24'
                                        >
                                            <path
                                                d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z'
                                                fill='#4285F4'
                                            />
                                            <path
                                                d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
                                                fill='#34A853'
                                            />
                                            <path
                                                d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
                                                fill='#FBBC05'
                                            />
                                            <path
                                                d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
                                                fill='#EA4335'
                                            />
                                        </svg>
                                    )}
                                    {t('auth.continueWithGoogle')}
                                </button>
                                <button
                                    onClick={() =>
                                        handleOAuth(OAUTH_PROVIDER.GITHUB)
                                    }
                                    disabled={!!loadingMethod}
                                    className='border-border bg-foreground/5 text-foreground hover:bg-foreground/10 flex h-11 w-full items-center justify-center gap-3 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50'
                                >
                                    {loadingMethod ===
                                    LOGIN_LOADING_METHOD.GITHUB ? (
                                        <CircleNotchIcon className='h-[18px] w-[18px] animate-spin' />
                                    ) : (
                                        <svg
                                            width='18'
                                            height='18'
                                            viewBox='0 0 24 24'
                                            fill='currentColor'
                                        >
                                            <path d='M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z' />
                                        </svg>
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
                    ) : (
                        <div className='border-border bg-foreground/[0.02] rounded-xl border p-8 backdrop-blur-sm'>
                            <button
                                onClick={handleChangeEmail}
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
                                    <span className='text-foreground font-medium'>
                                        {email}
                                    </span>
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
                                        maxLength={
                                            index === 0 ? CODE_LENGTH : 1
                                        }
                                        value={digit}
                                        onChange={(e) =>
                                            handleCodeChange(
                                                e.target.value,
                                                index
                                            )
                                        }
                                        onKeyDown={(e) =>
                                            handleCodeKeyDown(e.key, index)
                                        }
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
                                onClick={() => handleVerifyOtp(code.join(''))}
                                size='lg'
                                className='w-full gap-2 border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] text-white hover:opacity-90'
                                disabled={!!loadingMethod || !isCodeComplete}
                            >
                                {loadingMethod ===
                                    LOGIN_LOADING_METHOD.EMAIL && (
                                    <CircleNotchIcon className='h-4 w-4 animate-spin' />
                                )}
                                {t('auth.verifyCode')}
                            </Button>

                            <button
                                onClick={handleResend}
                                disabled={cooldown > 0 || !!loadingMethod}
                                className='text-muted-foreground hover:text-foreground/80 mt-4 flex w-full items-center justify-center gap-2 text-sm transition-colors disabled:opacity-50'
                            >
                                {loadingMethod ===
                                LOGIN_LOADING_METHOD.RESEND ? (
                                    <CircleNotchIcon className='h-3.5 w-3.5 animate-spin' />
                                ) : null}
                                {cooldown > 0
                                    ? t('auth.resendIn', {
                                          seconds: String(cooldown)
                                      })
                                    : t('auth.resendCode')}
                            </button>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    )
}

export default Login