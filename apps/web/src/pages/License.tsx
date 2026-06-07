import type { FC, ReactNode } from 'react'

import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { goLicense } from '@openclaw/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { api, ROUTES, isSafeRedirectUrl } from '@/lib'
import { useProfile, PROFILE_QUERY_KEY } from '@/hooks'
import { Button, Badge, Checkbox } from '@/components/ui'
import {
    Header,
    LandingFooter,
    LocalBackground,
    Logo,
    LanguageSelector,
    ThemeToggle,
    UserDropdown,
    PageBackground,
    PageTitle,
    PageHeader
} from '@/components'
import {
    CircleNotchIcon,
    CheckCircleIcon,
    CheckIcon,
    LightningIcon
} from '@phosphor-icons/react'

const License: FC = (): ReactNode => {
    const {
        loading: authLoading,
        isLocal,
        user,
        cachedProfile,
        signOut
    } = useAuth()
    const { data: profile } = useProfile({ enabled: !!user })
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()
    const [searchParams, setSearchParams] = useSearchParams()
    const [isPurchasing, setIsPurchasing] = useState(false)
    const [agreedToTerms, setAgreedToTerms] = useState(false)

    const hasLicense = profile?.hasLicense ?? false
    const localDisplayName =
        profile?.name || cachedProfile?.name || t('account.noNameSet')

    useEffect(() => {
        if (searchParams.get('payment') !== 'success') return
        showToast(t('license.paymentSuccess'), TOAST_TYPE.SUCCESS)
        queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })
        setSearchParams({}, { replace: true })
    }, [])

    const handlePurchase = async () => {
        setIsPurchasing(true)
        try {
            const { checkoutUrl } = await api.purchaseLicense()
            if (!isSafeRedirectUrl(checkoutUrl)) return
            window.location.href = checkoutUrl
        } catch {
            showToast(t('license.failedToPurchase'), TOAST_TYPE.ERROR)
            setIsPurchasing(false)
        }
    }

    const features = [
        t('license.featureUnlimitedClaws'),
        t('license.featureDevices'),
        t('license.featureUpdates'),
        t('license.featureSupport'),
        t('license.featureCloud')
    ]

    return (
        <div
            className={`bg-background text-foreground ${isLocal ? 'fixed inset-0 flex flex-col overflow-hidden' : 'relative flex min-h-screen flex-col'}`}
        >
            {isLocal && <LocalBackground />}
            <PageTitle
                title={t('license.title')}
                description={t('license.description')}
                noIndex
            />
            {!isLocal && <PageBackground />}
            {isLocal ? (
                <div className='border-border bg-background relative z-10 flex items-center justify-between border-b px-6 py-3'>
                    <Logo to={ROUTES.AGENTS} />
                    <div className='flex items-center gap-1.5 sm:gap-3'>
                        <LanguageSelector />
                        <ThemeToggle />
                        <UserDropdown
                            displayName={localDisplayName}
                            onSignOut={signOut}
                        />
                    </div>
                </div>
            ) : (
                <Header />
            )}

            <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className='relative mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-8'
            >
                {authLoading ? (
                    <div className='flex min-h-[60vh] items-center justify-center'>
                        <CircleNotchIcon className='text-foreground/50 h-7 w-7 animate-spin' />
                    </div>
                ) : (
                    <div>
                        <PageHeader
                            title={t('license.pageTitle')}
                            description={t('license.pageDescription')}
                        />

                        <div className='border-border bg-foreground/5 overflow-hidden rounded-xl border backdrop-blur-sm'>
                            <div className='p-4 sm:p-8'>
                                <div className='mb-6 flex items-center justify-between'>
                                    <h3 className='font-clash text-lg font-bold'>
                                        {t('license.planName')}
                                    </h3>
                                    <Badge
                                        variant='outline'
                                        className='border-border bg-foreground/5 text-foreground/80'
                                    >
                                        {t('license.oneTimePurchase')}
                                    </Badge>
                                </div>

                                <div className='mb-8'>
                                    <div className='flex items-baseline gap-1'>
                                        <span className='font-clash text-5xl font-bold'>
                                            {t('license.price', {
                                                price: goLicense.PRICE
                                            })}
                                        </span>
                                    </div>
                                    <p className='text-muted-foreground mt-1 text-sm'>
                                        {t('license.priceNote')}
                                    </p>
                                </div>

                                {hasLicense ? (
                                    <div className='flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3'>
                                        <CheckCircleIcon
                                            className='h-5 w-5 shrink-0 text-green-500'
                                            weight='fill'
                                        />
                                        <div>
                                            <p className='text-sm font-medium text-green-600 dark:text-green-400'>
                                                {t('license.activated')}
                                            </p>
                                            <p className='text-muted-foreground text-xs'>
                                                {t(
                                                    'license.activatedDescription'
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className='flex flex-col gap-4'>
                                        <label className='flex cursor-pointer items-start gap-2'>
                                            <Checkbox
                                                checked={agreedToTerms}
                                                onCheckedChange={(checked) =>
                                                    setAgreedToTerms(!!checked)
                                                }
                                                className='mt-0.5'
                                            />
                                            <span className='text-muted-foreground text-xs'>
                                                {t('auth.agreementNotice')}{' '}
                                                <Link
                                                    to={ROUTES.TERMS}
                                                    className='text-muted-foreground hover:text-foreground underline'
                                                    target='_blank'
                                                >
                                                    {t('auth.termsOfService')}
                                                </Link>{' '}
                                                {t('auth.andWord')}{' '}
                                                <Link
                                                    to={ROUTES.PRIVACY}
                                                    className='text-muted-foreground hover:text-foreground underline'
                                                    target='_blank'
                                                >
                                                    {t('auth.privacyPolicy')}
                                                </Link>
                                            </span>
                                        </label>
                                        <Button
                                            size='lg'
                                            disabled={
                                                isPurchasing || !agreedToTerms
                                            }
                                            onClick={handlePurchase}
                                            className='h-10 gap-2 border-0 bg-gradient-to-r from-[#0072C6] to-[#29F49A] text-sm text-white hover:opacity-90'
                                        >
                                            {isPurchasing ? (
                                                <CircleNotchIcon className='h-5 w-5 animate-spin' />
                                            ) : (
                                                <LightningIcon
                                                    className='h-5 w-5'
                                                    weight='fill'
                                                />
                                            )}
                                            {isPurchasing
                                                ? t('license.purchasing')
                                                : t('license.purchaseLicense')}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className='border-border border-t px-4 py-6 sm:px-8'>
                                <p className='text-muted-foreground mb-4 text-xs font-medium uppercase tracking-wider'>
                                    {t('license.whatsIncluded')}
                                </p>
                                <div className='grid gap-2.5'>
                                    {features.map((feature) => (
                                        <div
                                            key={feature}
                                            className='flex items-center gap-2.5'
                                        >
                                            <CheckIcon
                                                className='text-primary h-4 w-4 shrink-0'
                                                weight='bold'
                                            />
                                            <span className='text-foreground/80 text-sm'>
                                                {feature}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </motion.main>

            {!isLocal && <LandingFooter />}
        </div>
    )
}

export default License