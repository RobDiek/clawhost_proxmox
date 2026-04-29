import type { FC, ReactNode } from 'react'

import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { motion } from 'framer-motion'
import { getBaseDomain, ROUTES } from '@/lib'
import { useAuth } from '@/lib/auth'
import { OpenClawIcon, HermesIcon } from '@/components/icons'

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

import {
    usePlans,
    useGitHubStars,
    GITHUB_REPO_URL,
    useVideoSync,
    useDitherHover
} from '@/hooks'

import {
    v2Agents,
    getV2Faqs,
    getV2Features,
    getV2ComparisonRows,
    getV2Stats,
    v2VideoUrls,
    getV2NavLinks
} from '@/data'

import {
    ArrowRightIcon,
    GithubLogoIcon,
    RocketLaunchIcon
} from '@phosphor-icons/react'

const V2: FC = (): ReactNode => {
    const { user } = useAuth()
    const { data: gitHubStars } = useGitHubStars()

    const {
        plans: hetznerPlans,
        isLoading: hetznerLoading
    } = usePlans()

    const baseVideoRef = useRef<HTMLVideoElement>(null)
    const ditherVideoRef = useRef<HTMLVideoElement>(null)
    const heroSectionRef = useRef<HTMLElement>(null)
    
    useVideoSync(baseVideoRef, ditherVideoRef)

    const { onMouseMove, onMouseLeave, resetDither } = useDitherHover()

    const deployLink = user
        ? `${ROUTES.AGENTS}?deploy=true`
        : `${ROUTES.LOGIN}?deploy=true`

    const navLinks = getV2NavLinks()

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
                    ref={heroSectionRef}
                    className='v2-video-wrap relative flex h-[85vh] cursor-crosshair flex-col justify-start overflow-hidden px-6 pt-[18vh]'
                    onMouseMove={onMouseMove}
                    onMouseLeave={onMouseLeave}
                >
                    <video
                        ref={baseVideoRef}
                        className='v2-base-video absolute inset-0 h-full w-full -translate-y-[20%] object-cover'
                        autoPlay
                        muted
                        loop
                        playsInline
                    >
                        <source src={v2VideoUrls.NORMAL} type='video/mp4' />
                    </video>
                    <video
                        ref={ditherVideoRef}
                        className='v2-hover-video absolute inset-0 h-full w-full -translate-y-[20%] object-cover brightness-125 contrast-110'
                        autoPlay
                        muted
                        loop
                        playsInline
                    >
                        <source src={v2VideoUrls.DITHER} type='video/mp4' />
                    </video>

                    <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(10,10,15,0.9)_0%,rgba(10,10,15,0.3)_30%,#020204_70%)]' />

                    <div className='pointer-events-none absolute inset-0 z-10 flex flex-col justify-end pb-6'>
                        <div
                            className='pointer-events-auto mx-auto w-full max-w-6xl px-4 xl:px-0'
                            onMouseMove={(e) => e.stopPropagation()}
                            onMouseEnter={() => resetDither(heroSectionRef.current)}
                        >
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
                                        <RocketLaunchIcon className='h-3.5 w-3.5 transition-transform duration-200 group-hover/deploy:-translate-y-0.5' />
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
                    </div>
                </section>

                <div className='v2-section relative px-6 pb-28 pt-2'>
                    <div className='mx-auto max-w-6xl'>
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.9 }}
                            className='relative z-[15] grid grid-cols-2 border border-white/10 md:grid-cols-5'
                        >
                            {getV2Stats().map((stat, i) => (
                                <div key={i} className='border-white/10 bg-[#0c0c12] p-5 [&:not(:last-child)]:border-r'>
                                    <div className='font-syne text-2xl font-bold text-white md:text-3xl'>
                                        {stat.value}
                                    </div>
                                    <div className='font-mono text-[10px] tracking-[0.15em] text-white/40'>
                                        {stat.label.toUpperCase()}
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    </div>
                </div>

                <section id='agents' className='v2-section relative scroll-mt-24 border-t border-white/[0.15] px-6 py-24'>
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
                            {v2Agents.map((agent, i) => (
                                <div
                                    key={i}
                                    className='group relative border-white/10 bg-[#0c0c12] p-8 [&:not(:last-child)]:border-r'
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
                                        className='group/deploy inline-flex items-center gap-2 bg-[#6B5CE7] px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-white transition-opacity hover:opacity-90'
                                    >
                                        <RocketLaunchIcon className='h-3 w-3 transition-transform duration-200 group-hover/deploy:-translate-y-0.5' />
                                        {t('v2.deployButton').toUpperCase()}
                                        <ArrowRightIcon className='h-3 w-3 transition-transform duration-200 group-hover/deploy:translate-x-1' />
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
                    features={getV2Features()}
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
                    rows={getV2ComparisonRows()}
                />

                <FaqSectionV2
                    badge={t('landing.faqTitle')}
                    heading={t('landing.frequentlyAskedQuestions')}
                    description={t('landing.faqDescription')}
                    faqs={getV2Faqs()}
                />

                <section className='v2-section relative border-t border-white/[0.15] px-6 py-32'>
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
                                        <RocketLaunchIcon className='h-3.5 w-3.5 transition-transform duration-200 group-hover/deploy:-translate-y-0.5' />
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