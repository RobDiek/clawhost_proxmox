import type { FC, ReactNode } from 'react'

import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import {
    PageTitle,
    JsonLd,
    HeaderV2,
    FeaturesGridV2,
    FaqSectionV2,
    FooterV2,
    ScrollRevealV2,
    SectionLabelV2
} from '@/components'
import { getBaseDomain, ROUTES } from '@/lib'
import { useAuth } from '@/lib/auth'
import { useGitHubStars, GITHUB_REPO_URL } from '@/hooks'
import {
    getV2Features
} from '@/data'
import {
    ArrowRightIcon,
    GithubLogoIcon,
    RocketLaunchIcon
} from '@phosphor-icons/react'

const FeaturesV2: FC = (): ReactNode => {
    const { user } = useAuth()
    const { data: gitHubStars } = useGitHubStars()

    const deployLink = user
        ? `${ROUTES.AGENTS}?deploy=true`
        : `${ROUTES.LOGIN}?deploy=true`

    const navLinks = [
        { label: 'Cloud', href: ROUTES.V2, id: 'cloud' },
        { label: 'Go', href: ROUTES.GO, id: 'go' },
        { label: t('landing.features'), href: ROUTES.FEATURES, id: 'features' },
        { label: t('landing.pricing'), href: ROUTES.PRICING, id: 'pricing' },
        { label: t('landing.comparison'), href: ROUTES.COMPARE, id: 'comparison' }
    ]

    return (
        <div className='relative min-h-screen bg-[#020204] text-white'>
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

            <main className='v2-content pt-32'>
                <FeaturesGridV2
                    badge={t('landing.features')}
                    heading={t('v2.featuresTitle')}
                    description={t('v2.featuresDescription')}
                    features={getV2Features()}
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

                <section className='v2-section relative border-t border-white/[0.15] px-6 py-32'>
                    <ScrollRevealV2 className='mx-auto max-w-6xl'>
                        <div className='border border-white/10 bg-[#070709] p-12 md:p-16'>
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

export default FeaturesV2