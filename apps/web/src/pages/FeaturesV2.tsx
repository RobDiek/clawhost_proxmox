import type { FC, ReactNode } from 'react'

import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { motion } from 'framer-motion'
import {
    PageTitle,
    JsonLd,
    HeaderV2,
    FeaturesGridV2,
    ComparisonTableV2,
    FaqSectionV2,
    FooterV2,
    SectionLabelV2
} from '@/components'
import { getBaseDomain, ROUTES } from '@/lib'
import { useAuth } from '@/lib/auth'
import { GITHUB_REPO_URL } from '@/hooks'
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
    TerminalIcon,
    LightningIcon,
    GithubLogoIcon,
    RocketLaunchIcon,
    ArrowRightIcon
} from '@phosphor-icons/react'

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

const FeaturesV2: FC = (): ReactNode => {
    const { user } = useAuth()

    const deployLink = user
        ? `${ROUTES.AGENTS}?deploy=true`
        : `${ROUTES.LOGIN}?deploy=true`

    const navLinks = [
        { label: t('landing.features'), href: ROUTES.FEATURES, id: 'features' },
        { label: t('landing.pricing'), href: ROUTES.PRICING, id: 'pricing' },
        { label: t('landing.comparison'), href: ROUTES.COMPARE, id: 'comparison' },
        { label: t('nav.agentistGo'), href: ROUTES.GO, id: 'go' }
    ]

    return (
        <div className='relative min-h-screen bg-[#0a0a0f] text-white'>
            <PageTitle
                title={t('v2.featuresPageTitle')}
                description={t('v2.featuresPageDescription')}
                url={`https://${getBaseDomain()}/features`}
            />
            <JsonLd
                data={{
                    '@context': 'https://schema.org',
                    '@type': 'WebPage',
                    name: t('v2.featuresPageTitle'),
                    url: `https://${getBaseDomain()}/features`,
                    description: t('v2.featuresPageDescription')
                }}
            />

            <div className='v2-grain' />
            <div className='v2-grid pointer-events-none' />
            <div className='v2-gradient pointer-events-none fixed inset-0' />

            <HeaderV2 showNavLinks={true} navLinks={navLinks} />

            <main className='v2-content'>
                <section className='v2-section relative px-6 pb-24 pt-40'>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className='mx-auto max-w-6xl'
                    >
                        <div className='mb-6 flex items-center gap-4'>
                            <SectionLabelV2 label={t('landing.features')} />
                            <div className='h-px flex-1 bg-white/10' />
                        </div>

                        <h1 className='font-syne mb-4 text-4xl font-extrabold uppercase tracking-tight text-white md:text-5xl lg:text-6xl'>
                            {t('v2.featuresHeroTitle')}
                        </h1>
                        <p className='max-w-xl font-mono text-sm leading-relaxed text-white/40'>
                            {t('v2.featuresHeroDescription')}
                        </p>
                    </motion.div>
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

                <section className='v2-section relative scroll-mt-24 px-6 py-24'>
                    <div className='mx-auto max-w-6xl'>
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-100px' }}
                            transition={{ duration: 0.6 }}
                            className='mb-16'
                        >
                            <SectionLabelV2 label='Agent Catalog' />
                            <h2 className='font-syne mb-4 text-4xl font-extrabold uppercase tracking-tight text-white md:text-5xl'>
                                {t('v2.agentsTitle')}
                            </h2>
                            <p className='max-w-lg font-mono text-sm leading-relaxed text-white/40'>
                                {t('v2.agentsDescription')}
                            </p>
                        </motion.div>

                        <div className='grid gap-px border border-white/10 md:grid-cols-2'>
                            {agents.map((agent, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: '-50px' }}
                                    transition={{ duration: 0.5, delay: i * 0.1 }}
                                    className='group relative border-white/10 bg-white/[0.02] p-8 [&:not(:last-child)]:border-r'
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
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

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
                    faqs={[
                        { question: t('v2.faq1Question'), answer: t('v2.faq1Answer') },
                        { question: t('v2.faq2Question'), answer: t('v2.faq2Answer') },
                        { question: t('v2.faq3Question'), answer: t('v2.faq3Answer') },
                        { question: t('v2.faq4Question'), answer: t('v2.faq4Answer') },
                        { question: t('v2.faq5Question'), answer: t('v2.faq5Answer') },
                        { question: t('v2.faq6Question'), answer: t('v2.faq6Answer') },
                        { question: t('v2.faq7Question'), answer: t('v2.faq7Answer') }
                    ]}
                />

                <section className='v2-section relative px-6 py-32'>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-100px' }}
                        transition={{ duration: 0.6 }}
                        className='mx-auto max-w-6xl'
                    >
                        <div className='border border-white/10 bg-white/[0.02] p-12 md:p-16'>
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
                                        className='inline-flex items-center gap-2 bg-[#6B5CE7] px-8 py-4 font-mono text-xs font-semibold tracking-[0.15em] text-white transition-opacity hover:opacity-80'
                                    >
                                        <LightningIcon className='h-3.5 w-3.5' weight='fill' />
                                        {t('v2.deployButton').toUpperCase()}
                                    </Link>
                                    <a
                                        href={GITHUB_REPO_URL}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='inline-flex items-center gap-2 border border-white/20 bg-white/5 px-8 py-4 font-mono text-xs tracking-[0.15em] text-white/70 transition-colors hover:bg-white/10'
                                    >
                                        <GithubLogoIcon className='h-3.5 w-3.5' weight='fill' />
                                        {t('v2.selfHostLabel').toUpperCase()}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </section>
            </main>

            <FooterV2 />
        </div>
    )
}

export default FeaturesV2