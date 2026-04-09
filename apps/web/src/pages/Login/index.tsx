import type { FC, FormEvent, ReactNode } from 'react'

import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { useAuth } from '@/lib/auth'
import { useNetworkStatus } from '@/hooks'
import { ROUTES } from '@/lib'
import {
    AnnouncementBanner,
    Logo,
    NetworkStatus,
    PageBackground,
    PageTitle,
    ProductHuntBanner
} from '@/components'
import { CircleNotchIcon } from '@phosphor-icons/react'
import EmailStep from '@/pages/Login/EmailStep'
import OtpCodeStep from '@/pages/Login/OtpCodeStep'
import useOtpCooldown from '@/pages/Login/useOtpCooldown'
import useOtpFlow from '@/pages/Login/useOtpFlow'

const Login: FC = (): ReactNode => {
    const [email, setEmail] = useState('')
    const [step, setStep] = useState<'email' | 'code'>('email')
    const { user, loading: authLoading, isLocal } = useAuth()
    const isOffline = useNetworkStatus()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const planParam = searchParams.get('plan')
    const deployParam = searchParams.get('deploy')
    const providerParam = searchParams.get('provider')

    const { cooldown, startCooldown } = useOtpCooldown()

    const {
        code,
        codeError,
        emailError,
        loadingMethod,
        isCodeComplete,
        inputRefs,
        handleSendOtp,
        handleVerifyOtp,
        handleCodeChange,
        handleCodeKeyDown,
        handleResend,
        handleOAuth,
        resetCode
    } = useOtpFlow({
        email,
        cooldown,
        startCooldown,
        onCodeSent: () => setStep('code')
    })

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

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault()
        handleSendOtp()
    }

    const handleChangeEmail = () => {
        setStep('email')
        resetCode()
    }

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
                        <EmailStep
                            email={email}
                            setEmail={setEmail}
                            emailError={emailError}
                            loadingMethod={loadingMethod}
                            cooldown={cooldown}
                            onSubmit={handleSubmit}
                            onOAuth={handleOAuth}
                        />
                    ) : (
                        <OtpCodeStep
                            email={email}
                            code={code}
                            codeError={codeError}
                            isCodeComplete={isCodeComplete}
                            loadingMethod={loadingMethod}
                            cooldown={cooldown}
                            inputRefs={inputRefs}
                            onCodeChange={handleCodeChange}
                            onCodeKeyDown={handleCodeKeyDown}
                            onVerify={() => handleVerifyOtp(code.join(''))}
                            onResend={handleResend}
                            onChangeEmail={handleChangeEmail}
                        />
                    )}
                </motion.div>
            </div>
        </div>
    )
}

export default Login