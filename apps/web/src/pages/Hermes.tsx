import type { FC, ReactNode } from 'react'
import type { Faq } from '@/ts/Interfaces'

import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useScroll, useTransform } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { getBaseDomain, PATHS, SCROLL_SECTIONS } from '@/lib'
import {
    PageTitle,
    Header,
    LandingFooter,
    HeroButtons,
    HeroBadge,
    HeroTitle,
    StatsRow,
    DemoPreviewSection,
    FeaturesGrid,
    PricingSection,
    ComparisonTable,
    FaqSection,
    LandingCTA,
    JsonLd
} from '@/components'
import { usePlans } from '@/hooks'
import { useUIStore, usePreferencesStore } from '@/lib/store'
import { AGENT, PRODUCT } from '@/lib/constants'
import {
    GlobeIcon,
    ClockIcon,
    TerminalIcon,
    BrainIcon,
    CalendarBlankIcon,
    GitBranchIcon,
    ShieldCheckIcon,
    GaugeIcon,
    CreditCardIcon,
    LinkIcon,
    SlidersHorizontalIcon,
    StackIcon
} from '@phosphor-icons/react'

const getFaqs = (): Faq[] => [
    {
        question: t('landing.faq1Question'),
        answer: t('landing.faq1Answer')
    },
    {
        question: t('landing.faq2Question'),
        answer: t('landing.faq2Answer')
    },
    {
        question: t('landing.faq3Question'),
        answer: t('landing.faq3Answer')
    },
    {
        question: t('landing.faq4Question'),
        answer: t('landing.faq4Answer')
    },
    {
        question: t('landing.faq5Question'),
        answer: t('landing.faq5Answer')
    },
    {
        question: t('landing.faq6Question'),
        answer: t('landing.faq6Answer')
    },
    {
        question: t('landing.faq7Question'),
        answer: t('landing.faq7Answer')
    }
]

const Hermes: FC = (): ReactNode => {
    const { hash } = useLocation()
    const { phBannerVisible } = useUIStore()
    const setProduct = usePreferencesStore((s) => s.setProduct)
    const setAgent = usePreferencesStore((s) => s.setAgent)
    useEffect(() => {
        setProduct(PRODUCT.CLOUD)
        setAgent(AGENT.HERMES)
    }, [setProduct, setAgent])
    const {
        plans: hetznerPlans,
        isLoading: hetznerLoading,
        atCapacity: hetznerAtCapacity
    } = usePlans()

    const announcementVisible =
        !phBannerVisible &&
        !hetznerLoading &&
        (!hetznerPlans?.length || hetznerAtCapacity)

    const allDoneLoading = !hetznerLoading

    const plans = hetznerPlans
    const plansLoading = hetznerLoading

    const [activeSection, setActiveSection] = useState('')

    const previewRef = useRef<HTMLDivElement>(null)
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
        if (!hash) return
        const id = hash.replace('#', '')
        const el = document.getElementById(id)
        if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100)
    }, [hash])

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
        { label: t('landing.features'), href: '#features', id: 'features' },
        { label: t('landing.pricing'), href: '#pricing', id: 'pricing' },
        {
            label: t('landing.comparison'),
            href: '#comparison',
            id: 'comparison'
        },
        { label: t('landing.faqTitle'), href: '#faq', id: 'faq' }
    ]

    return (
        <div className='font-satoshi bg-background text-foreground min-h-screen'>
            <PageTitle
                title={t('hermes.title')}
                description={t('hermes.description')}
                image={`https://${getBaseDomain()}/og-image.webp`}
                url={`https://${getBaseDomain()}/${PATHS.HERMES}`}
            />
            <JsonLd
                data={{
                    '@context': 'https://schema.org',
                    '@type': 'WebPage',
                    name: 'Deploy Hermes Agent',
                    url: `https://${getBaseDomain()}/hermes`,
                    description: t('hermes.description'),
                    publisher: {
                        '@type': 'Organization',
                        name: 'ClawHost',
                        url: `https://${getBaseDomain()}`
                    }
                }}
            />

            <div className='landing-gradient pointer-events-none fixed inset-0' />

            <Header
                showNavLinks={true}
                navLinks={navLinks}
                activeSection={activeSection}
            />

            <main>
                <section
                    className={`relative overflow-hidden px-6 pb-16 ${phBannerVisible ? 'pt-44' : announcementVisible ? 'pt-44' : 'pt-32'}`}
                >
                    <div className='landing-grid pointer-events-none' />

                    <div className='animate-hero-fade-in relative mx-auto max-w-6xl'>
                        <div className='flex flex-col items-center text-center'>
                            <HeroBadge label={t('hermes.badge')} />

                            <HeroTitle
                                line1={t('hermes.heroTitle1')}
                                line2={t('hermes.heroTitle2')}
                                description={t('hermes.heroDescription')}
                            />

                            <div className='mb-16 flex flex-col gap-4 sm:flex-row'>
                                <HeroButtons
                                    deployLabel={t('hermes.deployButton')}
                                    githubLabel={t('hermes.githubButton')}
                                    showStars={true}
                                />
                            </div>

                            <StatsRow
                                stats={[
                                    {
                                        value: t('landing.startingPriceValue', {
                                            price: '25'
                                        }),
                                        label: t('landing.startingPrice')
                                    },
                                    {
                                        value: '30+',
                                        label: t('landing.locations')
                                    },
                                    {
                                        value: '45+',
                                        label: t('landing.servers')
                                    },
                                    {
                                        value: t('landing.zeroCount'),
                                        label: t('landing.zeroConfig')
                                    }
                                ]}
                            />
                        </div>
                    </div>
                </section>

                <DemoPreviewSection
                    previewRef={previewRef}
                    previewScale={previewScale}
                />

                <FeaturesGrid
                    badge={t('landing.features')}
                    heading={t('hermes.whyHermes')}
                    description={t('hermes.featuresDescription')}
                    features={[
                        {
                            icon: GlobeIcon,
                            title: t('hermes.feature1Title'),
                            description: t('hermes.feature1Description')
                        },
                        {
                            icon: BrainIcon,
                            title: t('hermes.feature2Title'),
                            description: t('hermes.feature2Description')
                        },
                        {
                            icon: CalendarBlankIcon,
                            title: t('hermes.feature3Title'),
                            description: t('hermes.feature3Description')
                        },
                        {
                            icon: GitBranchIcon,
                            title: t('hermes.feature4Title'),
                            description: t('hermes.feature4Description')
                        },
                        {
                            icon: ShieldCheckIcon,
                            title: t('hermes.feature5Title'),
                            description: t('hermes.feature5Description')
                        },
                        {
                            icon: TerminalIcon,
                            title: t('hermes.feature6Title'),
                            description: t('hermes.feature6Description')
                        },
                        {
                            icon: ClockIcon,
                            title: t('landing.zeroConfig'),
                            description: t('landing.zeroConfigDescription')
                        },
                        {
                            icon: GaugeIcon,
                            title: t('landing.fullSpeed'),
                            description: t('landing.fullSpeedDescription')
                        },
                        {
                            icon: CreditCardIcon,
                            title: t('landing.payAsYouGo'),
                            description: t('landing.payAsYouGoDescription')
                        },
                        {
                            icon: LinkIcon,
                            title: t('landing.customSubdomains'),
                            description: t(
                                'landing.customSubdomainsDescription'
                            )
                        },
                        {
                            icon: SlidersHorizontalIcon,
                            title: t('landing.openclawControl'),
                            description: t('landing.openclawControlDescription')
                        },
                        {
                            icon: StackIcon,
                            title: t('landing.multipleClaws'),
                            description: t('landing.multipleClawsDescription')
                        }
                    ]}
                />

                <PricingSection
                    plans={plans}
                    plansLoading={plansLoading}
                    allDoneLoading={allDoneLoading}
                />

                <ComparisonTable
                    badge={t('landing.comparison')}
                    heading={t('landing.comparisonTitle')}
                    description={t('landing.comparisonDescription')}
                    rows={[
                        {
                            us: t('nav.cloudSubtitle'),
                            others: t('nav.goSubtitle')
                        },
                        {
                            us: t('landing.comparisonOpenClawUs'),
                            others: t('landing.comparisonOpenClawOthers')
                        },
                        {
                            us: t('landing.comparisonPricingUs'),
                            others: t('landing.comparisonPricingOthers')
                        },
                        {
                            us: t('landing.comparisonOwnershipUs'),
                            others: t('landing.comparisonOwnershipOthers')
                        },
                        {
                            us: t('landing.comparisonSubdomainUs'),
                            others: t('landing.comparisonSubdomainOthers')
                        },
                        {
                            us: t('landing.comparisonInfraUs'),
                            others: t('landing.comparisonInfraOthers')
                        },
                        {
                            us: t('landing.comparisonDataUs'),
                            others: t('landing.comparisonDataOthers')
                        },
                        {
                            us: t('landing.comparisonMultipleUs'),
                            others: t('landing.comparisonMultipleOthers')
                        },
                        {
                            us: t('landing.comparisonOpenSourceUs'),
                            others: t('landing.comparisonOpenSourceOthers')
                        },
                        {
                            us: t('landing.comparisonExportUs'),
                            others: t('landing.comparisonExportOthers')
                        },
                        {
                            us: t('landing.comparisonProvidersUs'),
                            others: t('landing.comparisonProvidersOthers')
                        },
                        {
                            us: t('landing.comparisonVersionUs'),
                            others: t('landing.comparisonVersionOthers')
                        },
                        {
                            us: t('landing.comparisonTerminalUs'),
                            others: t('landing.comparisonTerminalOthers')
                        }
                    ]}
                />

                <FaqSection
                    badge={t('landing.faqTitle')}
                    heading={t('landing.frequentlyAskedQuestions')}
                    description={t('landing.faqDescription')}
                    faqs={getFaqs()}
                />

                <LandingCTA
                    title={t('hermes.ctaTitle')}
                    description={t('hermes.ctaDescription')}
                >
                    <HeroButtons
                        deployLabel={t('hermes.ctaDeploy')}
                        githubLabel={t('hermes.ctaGitHub')}
                        showStars={true}
                    />
                </LandingCTA>
            </main>

            <LandingFooter />
        </div>
    )
}

export default Hermes