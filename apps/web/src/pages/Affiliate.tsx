import type { FC, ReactNode } from 'react'
import type { AffiliatePeriod } from '@/ts/Types'

import { Fragment, useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import {
    useAffiliate,
    useGenerateReferralCode,
    useUpdateReferralCode,
    useProfile
} from '@/hooks'
import { getLocale, ROUTES } from '@/lib'
import { useAuth } from '@/lib/auth'
import { AFFILIATE_PERIOD, TOAST_TYPE } from '@/lib/constants'
import { useUIStore, usePreferencesStore } from '@/lib/store'
import {
    ErrorState,
    Header,
    LandingFooter,
    PageBackground,
    PageTitle,
    PageHeader
} from '@/components'
import {
    AffiliateConfirmDialog,
    AffiliatePaymentHistory,
    AffiliatePeriodSelector,
    AffiliateStatsGrid
} from '@/components/affiliate'

const PERIODS = Object.values(AFFILIATE_PERIOD)

const Affiliate: FC = (): ReactNode => {
    const { cachedProfile, updateCachedProfile } = useAuth()
    const { data: profile } = useProfile({ enabled: true })
    const generateCode = useGenerateReferralCode()
    const updateCode = useUpdateReferralCode()
    const showToast = useUIStore((s) => s.showToast)
    const storedAffiliatePeriod = usePreferencesStore((s) => s.affiliatePeriod)
    const setStoredAffiliatePeriod = usePreferencesStore(
        (s) => s.setAffiliatePeriod
    )
    const generatedRef = useRef(false)

    const [searchParams, setSearchParams] = useSearchParams()
    const [confirmSave, setConfirmSave] = useState(false)
    const [pendingCode, setPendingCode] = useState('')

    const period = (() => {
        const urlPeriod = searchParams.get('period')
        if (urlPeriod && PERIODS.includes(urlPeriod as AffiliatePeriod)) {
            return urlPeriod as AffiliatePeriod
        }
        if (PERIODS.includes(storedAffiliatePeriod)) {
            return storedAffiliatePeriod
        }
        return AFFILIATE_PERIOD.ALL
    })()

    useEffect(() => {
        const urlPeriod = searchParams.get('period')
        if (urlPeriod !== period) {
            setSearchParams(
                (prev) => {
                    prev.set('period', period)
                    return prev
                },
                { replace: true }
            )
        }
    }, [period, searchParams, setSearchParams])

    const setPeriod = useCallback(
        (p: AffiliatePeriod) => {
            setStoredAffiliatePeriod(p)
            setSearchParams(
                (prev) => {
                    prev.set('period', p)
                    return prev
                },
                { replace: false }
            )
        },
        [setSearchParams, setStoredAffiliatePeriod]
    )

    const [showLoading, setShowLoading] = useState(true)
    const prevPeriodRef = useRef(period)

    const {
        data: affiliate,
        isFetching,
        isError: isAffiliateError,
        refetch: refetchAffiliate
    } = useAffiliate(period)

    useEffect(() => {
        if (prevPeriodRef.current !== period) {
            prevPeriodRef.current = period
            setShowLoading(true)
        }
    }, [period])

    useEffect(() => {
        if (!isFetching && showLoading) {
            setShowLoading(false)
        }
    }, [isFetching, showLoading])

    const isAffiliateFetching = showLoading && isFetching

    const referralCode =
        profile?.referralCode ?? cachedProfile?.referralCode ?? null
    const referralCodeChanged =
        profile?.referralCodeChanged ??
        cachedProfile?.referralCodeChanged ??
        false

    useEffect(() => {
        if (profile && !profile.referralCode && !generatedRef.current) {
            generatedRef.current = true
            generateCode.mutate()
        }
    }, [profile, generateCode])

    const payments = affiliate?.payments ?? []
    const referralCount = affiliate?.referralCount ?? 0
    const totalEarnings = affiliate?.totalEarnings ?? 0

    const handleSave = (code: string) => {
        setPendingCode(code)
        setConfirmSave(true)
    }

    const handleCopy = () => {
        showToast(t('common.copied'), TOAST_TYPE.SUCCESS)
    }

    const confirmAndSave = () => {
        setConfirmSave(false)
        updateCode.mutate(
            { code: pendingCode },
            {
                onSuccess: () => {
                    setPendingCode('')
                    updateCachedProfile({
                        referralCode: pendingCode,
                        referralCodeChanged: true
                    })
                }
            }
        )
    }

    const formatCurrency = (cents: number) => {
        return new Intl.NumberFormat(getLocale(), {
            style: 'currency',
            currency: 'USD'
        }).format(cents / 100)
    }

    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title={t('affiliate.title')}
                description={t('affiliate.description')}
                noIndex
            />
            <PageBackground />
            <Header />

            <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className='relative mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-8'
            >
                <PageHeader title={t('affiliate.title')} />
                <p className='text-muted-foreground -mt-4 mb-6 text-base'>
                    {t('affiliate.subtitle')}{' '}
                    <Link
                        to={ROUTES.AFFILIATE_PROGRAM}
                        className='text-muted-foreground hover:text-foreground text-sm underline transition'
                    >
                        {t('affiliate.learnMore')}
                    </Link>
                </p>

                <div className='border-border bg-foreground/5 rounded-xl border p-8 backdrop-blur-sm'>
                    <AffiliatePeriodSelector
                        period={period}
                        onPeriodChange={setPeriod}
                    />

                    {isAffiliateError ? (
                        <ErrorState onRetry={refetchAffiliate} />
                    ) : (
                        <Fragment>
                            <AffiliateStatsGrid
                                referralCode={referralCode}
                                referralCodeChanged={referralCodeChanged}
                                isLoading={isAffiliateFetching}
                                referralCount={referralCount}
                                totalEarnings={totalEarnings}
                                formatCurrency={formatCurrency}
                                onSave={handleSave}
                                onCopy={handleCopy}
                                isPending={updateCode.isPending}
                            />

                            <AffiliatePaymentHistory
                                payments={payments}
                                isLoading={isAffiliateFetching}
                                formatCurrency={formatCurrency}
                            />
                        </Fragment>
                    )}
                </div>
            </motion.main>

            <AffiliateConfirmDialog
                open={confirmSave}
                onOpenChange={setConfirmSave}
                onConfirm={confirmAndSave}
                isPending={updateCode.isPending}
            />

            <LandingFooter />
        </div>
    )
}

export default Affiliate