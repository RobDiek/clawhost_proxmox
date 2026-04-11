import type { FC, ReactNode } from 'react'
import type { FeatureItem, Faq } from '@/ts/Interfaces'

import { useRef, useState, useEffect, useCallback, type FormEvent } from 'react'
import { useScroll, useTransform } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { goLicense } from '@openclaw/shared'
import { SCROLL_SECTIONS } from '@/lib'
import {
    PageTitle,
    Header,
    LandingFooter,
    FeaturesGrid,
    ComparisonTable,
    FaqSection,
    HeroBadge,
    HeroTitle,
    StatsRow,
    MacosDesktopPreview,
    GoPricingCard,
    LandingCTA,
    GoWaitlistForm
} from '@/components'
import { usePreferencesStore, useUIStore } from '@/lib/store'
import { PRODUCT, TOAST_TYPE } from '@/lib/constants'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib'
import {
    ClockIcon,
    LockIcon,
    TerminalIcon,
    CreditCardIcon,
    LinkIcon,
    ShieldCheckIcon,
    GitBranchIcon,
    SlidersHorizontalIcon,
    GearSixIcon
} from '@phosphor-icons/react'

const getGoFeatures = (): FeatureItem[] => [
    {
        icon: ClockIcon,
        title: t('landing.zeroConfig'),
        description: t('go.zeroConfigDescription')
    },
    {
        icon: LockIcon,
        title: t('landing.ownedData'),
        description: t('go.ownedDataDescription')
    },
    {
        icon: TerminalIcon,
        title: t('landing.fullSshAccess'),
        description: t('go.terminalAccessDescription')
    },
    {
        icon: CreditCardIcon,
        title: t('go.simplePricing'),
        description: t('go.simplePricingDescription')
    },
    {
        icon: LinkIcon,
        title: t('go.localDomain'),
        description: t('go.localDomainDescription')
    },
    {
        icon: ShieldCheckIcon,
        title: t('landing.secure'),
        description: t('go.secureDescription')
    },
    {
        icon: GitBranchIcon,
        title: t('landing.autoUpdates'),
        description: t('landing.autoUpdatesDescription')
    },
    {
        icon: SlidersHorizontalIcon,
        title: t('landing.openclawControl'),
        description: t('landing.openclawControlDescription')
    },
    {
        icon: GearSixIcon,
        title: t('landing.clawHostControl'),
        description: t('landing.clawHostControlDescription')
    }
]

const getGoFaqs = (): Faq[] => [
    {
        question: t('go.faq1Question'),
        answer: t('go.faq1Answer')
    },
    {
        question: t('go.faq2Question'),
        answer: t('go.faq2Answer')
    },
    {
        question: t('go.faq3Question'),
        answer: t('go.faq3Answer')
    },
    {
        question: t('go.faq4Question'),
        answer: t('go.faq4Answer')
    },
    {
        question: t('go.faq5Question'),
        answer: t('go.faq5Answer')
    },
    {
        question: t('go.faq6Question'),
        answer: t('go.faq6Answer')
    }
]

const Go: FC = (): ReactNode => {
    const setProduct = usePreferencesStore((s) => s.setProduct)
    useEffect(() => setProduct(PRODUCT.GO), [setProduct])
    const { user, loading: authLoading } = useAuth()
    const showToast = useUIStore((s) => s.showToast)
    const [activeSection, setActiveSection] = useState('')
    const [hasJoined, setHasJoined] = useState(false)
    const [isJoining, setIsJoining] = useState(false)
    const [isCheckingStatus, setIsCheckingStatus] = useState(false)
    const [waitlistEmail, setWaitlistEmail] = useState('')
    const previewRef = useRef<HTMLDivElement>(null)

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
        (e: FormEvent) => {
            e.preventDefault()
            if (!isValidEmail) return
            handleJoinWaitlist(waitlistEmail.trim())
        },
        [waitlistEmail, isValidEmail, handleJoinWaitlist]
    )
    const { scrollYProgress: previewProgress } = useScroll({
        target: previewRef,
        offset: ['start end', 'end start']
    })
    const previewScale = useTransform(
        previewProgress,
        [0, 0.4, 0.6, 1],
        [0.92, 1.02, 1.02, 0.92]
    )

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY < 200) {
                setActiveSection('')
                return
            }
            const sections = SCROLL_SECTIONS
            for (const section of sections) {
                const el = document.getElementById(section)
                if (el && window.scrollY >= el.offsetTop - 100) {
                    setActiveSection(section)
                    break
                }
            }
        }
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    const navLinks = [
        { label: t('go.features'), href: '#features', id: 'features' },
        { label: t('go.pricing'), href: '#pricing', id: 'pricing' },
        { label: t('go.comparison'), href: '#comparison', id: 'comparison' },
        { label: t('go.faqTitle'), href: '#faq', id: 'faq' }
    ]

    const waitlistFormProps = {
        user,
        authLoading,
        hasJoined,
        isJoining,
        isCheckingStatus,
        waitlistEmail,
        isValidEmail,
        onWaitlistEmailChange: setWaitlistEmail,
        onJoinWaitlist: handleJoinWaitlist,
        onEmailSubmit: handleEmailSubmit
    }

    return (
        <div className='font-satoshi bg-background text-foreground min-h-screen'>
            <PageTitle title={t('go.pageTitle')} />

            <div className='landing-gradient pointer-events-none fixed inset-0' />

            <Header
                showNavLinks={true}
                navLinks={navLinks}
                activeSection={activeSection}
            />

            <main>
                <section className='relative overflow-hidden px-6 pb-16 pt-32'>
                    <div className='landing-grid pointer-events-none' />

                    <div className='animate-hero-fade-in relative mx-auto max-w-6xl'>
                        <div className='flex flex-col items-center text-center'>
                            <HeroBadge label={t('go.badge')} />

                            <HeroTitle
                                line1={t('go.heroTitle1')}
                                line2={t('go.heroTitle2')}
                                description={t('go.description')}
                            />

                            <div className='mb-16 flex flex-col gap-4 sm:flex-row'>
                                <GoWaitlistForm {...waitlistFormProps} />
                            </div>

                            <StatsRow
                                stats={[
                                    {
                                        value: t('go.statsPrice', {
                                            price: goLicense.PRICE
                                        }),
                                        label: t('go.statsLifetime')
                                    },
                                    {
                                        value: t('go.statsOneTime'),
                                        label: t('go.statsPayment')
                                    },
                                    {
                                        value: t('go.statsLocal'),
                                        label: t('go.statsLocally')
                                    },
                                    {
                                        value: t('go.statsZero'),
                                        label: t('go.statsZeroConfig')
                                    }
                                ]}
                            />
                        </div>
                    </div>
                </section>

                <MacosDesktopPreview
                    previewRef={previewRef}
                    previewScale={previewScale}
                />

                <FeaturesGrid
                    badge={t('go.features')}
                    heading={t('go.whyClawHostGo')}
                    description={t('go.featuresDescription')}
                    features={getGoFeatures()}
                />

                <section
                    id='pricing'
                    className='border-border border-t px-6 py-32'
                >
                    <div className='mx-auto max-w-4xl'>
                        <div className='mb-16 text-center'>
                            <div className='mb-4 inline-flex items-center gap-2 rounded-full border border-[#ef5350]/20 bg-[#ef5350]/10 px-3 py-1 text-sm text-[#ef5350]'>
                                {t('go.pricing')}
                            </div>
                            <h2 className='font-clash mb-4 text-3xl font-bold md:text-4xl'>
                                {t('go.pricingTitle')}
                            </h2>
                            <p className='text-muted-foreground mx-auto max-w-xl'>
                                {t('go.pricingDescription')}
                            </p>
                        </div>

                        <GoPricingCard
                            price={t('go.pricingPrice', {
                                price: goLicense.PRICE
                            })}
                            label={t('go.pricingLabel')}
                            features={[
                                t('go.pricingFeature1'),
                                t('go.pricingFeature2'),
                                t('go.pricingFeature3'),
                                t('go.pricingFeature4'),
                                t('go.pricingFeature5'),
                                t('go.pricingFeature6')
                            ]}
                        />
                    </div>
                </section>

                <ComparisonTable
                    badge={t('go.comparison')}
                    heading={t('go.comparisonTitle')}
                    description={t('go.comparisonDescription')}
                    logoSuffix='Go'
                    rows={[
                        {
                            us: t('nav.goSubtitle'),
                            others: t('nav.cloudSubtitle')
                        },
                        {
                            us: t('go.comparisonLocalUs'),
                            others: t('go.comparisonLocalOthers')
                        },
                        {
                            us: t('go.comparisonPricingUs'),
                            others: t('go.comparisonPricingOthers')
                        },
                        {
                            us: t('go.comparisonDataUs'),
                            others: t('go.comparisonDataOthers')
                        },
                        {
                            us: t('go.comparisonSetupUs'),
                            others: t('go.comparisonSetupOthers')
                        },
                        {
                            us: t('go.comparisonUpdatesUs'),
                            others: t('go.comparisonUpdatesOthers')
                        }
                    ]}
                    showFullComparisonLink={false}
                />

                <FaqSection
                    badge={t('go.faqTitle')}
                    heading={t('go.faqHeading')}
                    description={t('go.faqDescription')}
                    faqs={getGoFaqs()}
                />

                <LandingCTA
                    title={t('go.ctaTitle')}
                    description={t('go.ctaDescription')}
                >
                    <GoWaitlistForm
                        {...waitlistFormProps}
                        guestClassName='flex gap-2'
                    />
                </LandingCTA>
            </main>

            <LandingFooter />
        </div>
    )
}

export default Go