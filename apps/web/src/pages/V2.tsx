import type { FC, MouseEvent, ReactNode } from 'react'
import type { Faq } from '@/ts/Interfaces'

import { useCallback, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { motion } from 'framer-motion'
import {
    PageTitle,
    JsonLd,
    HeaderV2,
    FeaturesGridV2,
    PricingSectionV2,
    ComparisonTableV2,
    FaqSectionV2,
    FooterV2,
    ScrollRevealV2,
    SectionLabelV2
} from '@/components'
import { getBaseDomain, ROUTES } from '@/lib'
import { useAuth } from '@/lib/auth'
import { usePlans, useGitHubStars, GITHUB_REPO_URL } from '@/hooks'
import { OpenClawIcon, HermesIcon } from '@/components/icons'
import {
    CubeIcon,
    GlobeIcon,
    ShieldCheckIcon,
    CreditCardIcon,
    ClockIcon,
    LockIcon,
    GaugeIcon,
    LinkIcon,
    SlidersHorizontalIcon,
    StackIcon,
    GitBranchIcon,
    ArrowRightIcon,
    GithubLogoIcon,
    RocketLaunchIcon,
    TerminalIcon
} from '@phosphor-icons/react'

const NORMAL_VIDEO = 'https://s3.amazonaws.com/webflow-prod-assets/698212678435dd6c87683be3/69970cf01991478bec7e632b_normal-groq-preset.mp4'
const DITHER_VIDEO = 'https://s3.amazonaws.com/webflow-prod-assets/6984977952142a5f2fc3c5a8/6985f7cc9473caa2e4979c9b_dither_1080p.mp4'

const agents = [
    {
        nameKey: 'v2.agentOpenclawName' as const,
        descKey: 'v2.agentOpenclawDescription' as const,
        tag: 'CLOUD_MGMT',
        iconType: 'openclaw' as const
    },
    {
        nameKey: 'v2.agentHermesName' as const,
        descKey: 'v2.agentHermesDescription' as const,
        tag: 'AUTONOMOUS',
        iconType: 'hermes' as const
    }
]

const getFaqs = (): Faq[] => [
    { question: t('v2.faq1Question'), answer: t('v2.faq1Answer') },
    { question: t('v2.faq2Question'), answer: t('v2.faq2Answer') },
    { question: t('v2.faq3Question'), answer: t('v2.faq3Answer') },
    { question: t('v2.faq4Question'), answer: t('v2.faq4Answer') },
    { question: t('v2.faq5Question'), answer: t('v2.faq5Answer') },
    { question: t('v2.faq6Question'), answer: t('v2.faq6Answer') },
    { question: t('v2.faq7Question'), answer: t('v2.faq7Answer') }
]

const V2: FC = (): ReactNode => {
    const { user } = useAuth()
    const { data: gitHubStars } = useGitHubStars()

    const {
        plans: hetznerPlans,
        isLoading: hetznerLoading
    } = usePlans()

    const baseVideoRef = useRef<HTMLVideoElement>(null)
    const ditherVideoRef = useRef<HTMLVideoElement>(null)

    const deployLink = user
        ? `${ROUTES.AGENTS}?deploy=true`
        : `${ROUTES.LOGIN}?deploy=true`

    useEffect(() => {
        const base = baseVideoRef.current
        const dither = ditherVideoRef.current
        if (!base || !dither) return

        const sync = () => {
            if (Math.abs(base.currentTime - dither.currentTime) > 0.1) {
                dither.currentTime = base.currentTime
            }
        }

        base.addEventListener('play', sync)
        base.addEventListener('seeked', sync)
        const interval = setInterval(sync, 1000)

        return () => {
            base.removeEventListener('play', sync)
            base.removeEventListener('seeked', sync)
            clearInterval(interval)
        }
    }, [])

    const handleVideoMouseMove = useCallback((e: MouseEvent<HTMLElement>) => {
        const el = e.currentTarget
        const rect = el.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const videoOffset = rect.height * 0.2
        const my = e.clientY - rect.top + videoOffset
        const videoHeight = rect.height + videoOffset
        const size = 200
        const half = size / 2
        const top = Math.max(0, my - half)
        const left = Math.max(0, mx - half)
        const bottom = Math.max(0, videoHeight - my - half)
        const right = Math.max(0, rect.width - mx - half)
        el.style.setProperty('--sq-clip-top', `${top}px`)
        el.style.setProperty('--sq-clip-right', `${right}px`)
        el.style.setProperty('--sq-clip-bottom', `${bottom}px`)
        el.style.setProperty('--sq-clip-left', `${left}px`)
        el.style.setProperty('--sq-x', `${mx - half}px`)
        el.style.setProperty('--sq-y', `${my - half}px`)
        el.style.setProperty('--sq-w', `${size}px`)
        el.style.setProperty('--sq-h', `${size}px`)
    }, [])

    const handleVideoMouseLeave = useCallback((e: MouseEvent<HTMLElement>) => {
        const el = e.currentTarget
        el.style.setProperty('--sq-clip-top', '100%')
        el.style.setProperty('--sq-clip-right', '100%')
        el.style.setProperty('--sq-clip-bottom', '100%')
        el.style.setProperty('--sq-clip-left', '100%')
        el.style.setProperty('--sq-x', '-999px')
        el.style.setProperty('--sq-y', '-999px')
        el.style.setProperty('--sq-w', '0px')
        el.style.setProperty('--sq-h', '0px')
    }, [])

    const navLinks = [
        { label: t('landing.features'), href: ROUTES.FEATURES, id: 'features' },
        { label: t('landing.pricing'), href: ROUTES.PRICING, id: 'pricing' },
        { label: t('landing.comparison'), href: ROUTES.COMPARE, id: 'comparison' },
        { label: t('nav.agentistGo'), href: ROUTES.GO, id: 'go' }
    ]

    return (
        <div className='relative min-h-screen bg-[#020204] text-white'>
            <PageTitle
                title={t('v2.title')}
                description={t('v2.description')}
                url={`https://${getBaseDomain()}/v2`}
            />
            <JsonLd
                data={{
                    '@context': 'https://schema.org',
                    '@type': 'WebPage',
                    name: 'agent.ic',
                    url: `https://${getBaseDomain()}/v2`,
                    description: t('v2.description')
                }}
            />

            <div className='v2-grain' />
            <div className='v2-grid pointer-events-none' />
            <div className='v2-gradient pointer-events-none fixed inset-0' />

            <HeaderV2
                showNavLinks={true}
                navLinks={navLinks}
            />

            <main className='v2-content'>
                <section
                    className='v2-video-wrap relative flex h-[85vh] cursor-crosshair flex-col justify-start overflow-hidden px-6 pt-[18vh]'
                    onMouseMove={handleVideoMouseMove}
                    onMouseLeave={handleVideoMouseLeave}
                >
                    <video
                        ref={baseVideoRef}
                        className='v2-base-video absolute inset-0 h-full w-full -translate-y-[20%] object-cover'
                        autoPlay
                        muted
                        loop
                        playsInline
                    >
                        <source src={NORMAL_VIDEO} type='video/mp4' />
                    </video>
                    <video
                        ref={ditherVideoRef}
                        className='v2-hover-video absolute inset-0 h-full w-full -translate-y-[20%] object-cover brightness-125 contrast-110'
                        autoPlay
                        muted
                        loop
                        playsInline
                    >
                        <source src={DITHER_VIDEO} type='video/mp4' />
                    </video>

                    <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(10,10,15,0.9)_0%,rgba(10,10,15,0.3)_30%,#020204_70%)]' />

                    <div className='z-10 mx-auto w-full absolute max-w-6xl inset-0 flex flex-col justify-end px-6 pb-16'>
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className='mb-6 flex items-center gap-4'
                        >
                            <SectionLabelV2 label='Multi Agent Platform' />
                            <div className='h-px flex-1 bg-white/10' />
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.4 }}
                            className='mb-6 font-syne text-4xl font-bold uppercase leading-[0.95] tracking-tight text-white/90 md:text-6xl lg:text-[4.2rem]'
                        >
                            {t('v2.heroTitle1')}{' '}
                            <span className='font-extrabold italic text-[#6B5CE7]'>
                                {t('v2.heroTitle2')}
                            </span>
                            <br />
                            {t('v2.heroTitle3')}
                        </motion.h1>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.7 }}
                            className='flex flex-col gap-8 md:flex-row md:items-end md:justify-between'
                        >
                            <p className='max-w-md font-mono text-sm leading-relaxed text-white/50'>
                                {t('v2.heroDescription')}
                            </p>
                            <div className='flex gap-3'>
                                <Link
                                    to={deployLink}
                                    className='group/deploy pointer-events-auto inline-flex items-center gap-2 bg-[#6B5CE7] px-6 py-3 font-mono text-xs font-semibold tracking-[0.1em] text-white transition-opacity hover:opacity-90'
                                >
                                    <RocketLaunchIcon className='h-3.5 w-3.5' />
                                    {t('v2.deployButton').toUpperCase()}
                                    <ArrowRightIcon className='h-3.5 w-3.5 transition-transform duration-200 group-hover/deploy:translate-x-1' />
                                </Link>
                                <a
                                    href={GITHUB_REPO_URL}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='pointer-events-auto inline-flex items-center gap-2 border border-white/20 bg-white/5 px-6 py-3 font-mono text-xs tracking-[0.1em] text-white/70 transition-colors hover:bg-white/10'
                                >
                                    <GithubLogoIcon className='h-3.5 w-3.5' weight='fill' />
                                    {t('v2.selfHostLabel').toUpperCase()}
                                    {gitHubStars && (
                                        <span className='bg-white/10 flex items-center gap-1 px-2 py-0.5 text-[10px]'>
                                            {gitHubStars.formatted}
                                            <span className='text-[10px]'>★</span>
                                        </span>
                                    )}
                                </a>
                            </div>
                        </motion.div>

                    </div>
                </section>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 1.0 }}
                    className='relative z-10 mx-auto max-w-6xl px-6'
                >
                    <div className='-mt-1 grid grid-cols-2 border border-white/10 md:grid-cols-5'>
                        {[
                            { value: t('landing.startingPriceValue', { price: 25 }), label: t('landing.pricing') },
                            { value: t('go.statsZero'), label: t('go.statsZeroConfig') },
                            { value: t('v2.stats2Value'), label: t('v2.stats2Label') },
                            { value: t('v2.stats3Value'), label: t('v2.stats3Label') },
                            { value: t('v2.stats4Value'), label: t('v2.stats4Label') }
                        ].map((stat, i) => (
                            <div key={i} className='border-white/10 bg-[#020204] p-5 [&:not(:last-child)]:border-r'>
                                <div className='font-syne text-2xl font-bold text-white md:text-3xl'>
                                    {stat.value}
                                </div>
                                <div className='font-mono text-[10px] tracking-[0.15em] text-white/40'>
                                    {stat.label.toUpperCase()}
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                <section id='agents' className='v2-section relative scroll-mt-24 px-6 py-24'>
                    <div className='mx-auto max-w-6xl'>
                        <ScrollRevealV2 className='mb-16'>
                            <SectionLabelV2 label='Agent Catalog' />
                            <h2 className='font-syne mb-4 text-4xl font-extrabold uppercase tracking-tight text-white md:text-5xl'>
                                {t('v2.agentsTitle')}
                            </h2>
                            <p className='max-w-lg font-mono text-sm leading-relaxed text-white/40'>
                                {t('v2.agentsDescription')}
                            </p>
                        </ScrollRevealV2>

                        <ScrollRevealV2 delay={0.2} className='relative z-[15] grid gap-px border border-white/10 md:grid-cols-2'>
                            {agents.map((agent, i) => (
                                <div
                                    key={i}
                                    className='group relative border-white/10 bg-[#070709] p-8 [&:not(:last-child)]:border-r'
                                >
                                    <div className='mb-6 flex items-center justify-between'>
                                        <div className='text-white'>
                                            {agent.iconType === 'openclaw' ? <OpenClawIcon size={32} /> : <HermesIcon size={32} />}
                                        </div>
                                        <span className='font-mono text-[10px] tracking-[0.2em] text-white/30'>
                                            {agent.tag}
                                        </span>
                                    </div>

                                    <h3 className='font-syne mb-2 text-xl font-extrabold uppercase tracking-wide text-white'>
                                        {t(agent.nameKey)}
                                    </h3>
                                    <p className='mb-8 font-mono text-xs leading-relaxed text-white/40'>
                                        {t(agent.descKey)}
                                    </p>

                                    <Link
                                        to={deployLink}
                                        className='inline-flex items-center gap-2 bg-[#6B5CE7] px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-white transition-opacity hover:opacity-80'
                                    >
                                        <RocketLaunchIcon className='h-3 w-3' />
                                        DEPLOY
                                        <ArrowRightIcon className='h-3 w-3' />
                                    </Link>
                                </div>
                            ))}
                        </ScrollRevealV2>
                    </div>
                </section>

                <FeaturesGridV2
                    badge={t('landing.features')}
                    heading={t('v2.featuresTitle')}
                    description={t('v2.featuresDescription')}
                    features={[
                        { icon: CubeIcon, title: t('v2.feature1Title'), description: t('v2.feature1Description') },
                        { icon: ClockIcon, title: t('landing.zeroConfig'), description: t('v2.zeroConfigDescription') },
                        { icon: LockIcon, title: t('landing.ownedData'), description: t('landing.ownedDataDescription') },
                        { icon: GaugeIcon, title: t('landing.fullSpeed'), description: t('landing.fullSpeedDescription') },
                        { icon: GlobeIcon, title: t('landing.globalLocations'), description: t('v2.globalLocationsDescription') },
                        { icon: TerminalIcon, title: t('landing.fullSshAccess'), description: t('landing.fullSshAccessDescription') },
                        { icon: CreditCardIcon, title: t('landing.payAsYouGo'), description: t('landing.payAsYouGoDescription') },
                        { icon: LinkIcon, title: t('landing.customSubdomains'), description: t('v2.onlineAccessDescription') },
                        { icon: ShieldCheckIcon, title: t('landing.secure'), description: t('landing.secureDescription') },
                        { icon: GitBranchIcon, title: t('landing.autoUpdates'), description: t('v2.versionControlDescription') },
                        { icon: SlidersHorizontalIcon, title: t('v2.agentControlTitle'), description: t('v2.agentControlDescription') },
                        { icon: StackIcon, title: t('v2.multipleAgentsTitle'), description: t('v2.multipleAgentsDescription') }
                    ]}
                />

                <PricingSectionV2
                    plans={hetznerPlans}
                    plansLoading={hetznerLoading}
                    allDoneLoading={!hetznerLoading}
                />

                <ComparisonTableV2
                    showFullComparisonLink={false}
                    badge={t('landing.comparison')}
                    heading={t('landing.comparisonTitle')}
                    description={t('landing.comparisonDescription')}
                    rows={[
                        { us: t('v2.comparisonUsLabel'), others: t('v2.comparisonOthersLabel') },
                        { us: t('v2.comparisonAgentAccessUs'), others: t('landing.comparisonOpenClawOthers') },
                        { us: t('landing.comparisonPricingUs'), others: t('landing.comparisonPricingOthers') },
                        { us: t('landing.comparisonOwnershipUs'), others: t('landing.comparisonOwnershipOthers') },
                        { us: t('landing.comparisonSubdomainUs'), others: t('landing.comparisonSubdomainOthers') },
                        { us: t('landing.comparisonInfraUs'), others: t('landing.comparisonInfraOthers') },
                        { us: t('landing.comparisonDataUs'), others: t('landing.comparisonDataOthers') },
                        { us: t('v2.comparisonMultipleAgentsUs'), others: t('v2.comparisonMultipleAgentsOthers') },
                        { us: t('landing.comparisonOpenSourceUs'), others: t('landing.comparisonOpenSourceOthers') },
                        { us: t('v2.comparisonExportAgentsUs'), others: t('landing.comparisonExportOthers') },
                        { us: t('landing.comparisonProvidersUs'), others: t('landing.comparisonProvidersOthers') },
                        { us: t('landing.comparisonVersionUs'), others: t('landing.comparisonVersionOthers') },
                        { us: t('landing.comparisonTerminalUs'), others: t('landing.comparisonTerminalOthers') }
                    ]}
                />

                <FaqSectionV2
                    badge={t('landing.faqTitle')}
                    heading={t('landing.frequentlyAskedQuestions')}
                    description={t('landing.faqDescription')}
                    faqs={getFaqs()}
                />

                <section className='v2-section relative px-6 py-32'>
                    <ScrollRevealV2 className='mx-auto max-w-6xl'>
                        <div className='relative z-[15] border border-white/10 bg-[#070709] p-12 md:p-16'>
                            <div className='flex flex-col items-center text-center'>
                                <SectionLabelV2 label='Get Started' />
                                <h2 className='font-syne mb-2 text-3xl font-extrabold uppercase tracking-tight text-white md:text-4xl'>
                                    {t('v2.ctaTitle')}
                                </h2>
                                <p className='mb-10 max-w-lg font-mono text-sm leading-relaxed text-white/40'>
                                    {t('v2.ctaDescription')}
                                </p>
                                <div className='flex flex-col gap-3 sm:flex-row'>
                                    <Link
                                        to={deployLink}
                                        className='group/deploy inline-flex items-center gap-2 bg-[#6B5CE7] px-8 py-4 font-mono text-xs font-semibold tracking-[0.15em] text-white transition-opacity hover:opacity-90'
                                    >
                                        <RocketLaunchIcon className='h-3.5 w-3.5' />
                                        {t('v2.deployButton').toUpperCase()}
                                        <ArrowRightIcon className='h-3.5 w-3.5 transition-transform duration-200 group-hover/deploy:translate-x-1' />
                                    </Link>
                                    <a
                                        href={GITHUB_REPO_URL}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='inline-flex items-center gap-2 border border-white/20 bg-white/5 px-8 py-4 font-mono text-xs tracking-[0.15em] text-white/70 transition-colors hover:bg-white/10'
                                    >
                                        <GithubLogoIcon className='h-3.5 w-3.5' weight='fill' />
                                        {t('v2.selfHostLabel').toUpperCase()}
                                        {gitHubStars && (
                                            <span className='flex items-center gap-1 bg-white/10 px-2 py-0.5 text-[10px]'>
                                                {gitHubStars.formatted}
                                                <span className='text-[10px]'>★</span>
                                            </span>
                                        )}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </ScrollRevealV2>
                </section>
            </main>

            <FooterV2 />
        </div>
    )
}

export default V2