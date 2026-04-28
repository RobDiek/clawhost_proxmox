import type { FC, MouseEvent, ReactNode } from 'react'

import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import LogoV2 from '@/components/v2/LogoV2'
import { ROUTES } from '@/lib'
import { GITHUB_REPO_URL } from '@/hooks'
import {
    TWITTER_URL,
    FACEBOOK_URL,
    INSTAGRAM_URL,
    THREADS_URL,
    YOUTUBE_URL,
    TIKTOK_URL,
    SUPPORT_EMAIL
} from '@/lib/links'
import {
    FacebookLogoIcon,
    GithubLogoIcon,
    InstagramLogoIcon,
    ThreadsLogoIcon,
    TiktokLogoIcon,
    XLogoIcon,
    YoutubeLogoIcon
} from '@phosphor-icons/react'

const LANDING_SECTIONS = ['features', 'pricing', 'comparison', 'faq']

const FooterV2: FC = (): ReactNode => {
    const { pathname } = useLocation()
    const isLanding =
        pathname === ROUTES.HOME ||
        pathname === ROUTES.HERMES ||
        pathname === ROUTES.HERMES_GO ||
        pathname === ROUTES.V2 ||
        pathname === ROUTES.PRICING ||
        pathname === ROUTES.FEATURES
    const [activeSection, setActiveSection] = useState('')

    useEffect(() => {
        if (!isLanding) return

        const handleScroll = (): void => {
            for (const section of [...LANDING_SECTIONS].reverse()) {
                const el = document.getElementById(section)
                if (el && window.scrollY >= el.offsetTop - 100) {
                    setActiveSection(section)
                    return
                }
            }
            if (window.scrollY < 200) setActiveSection('')
        }

        window.addEventListener('scroll', handleScroll)
        handleScroll()
        return () => window.removeEventListener('scroll', handleScroll)
    }, [isLanding])

    const hashClass = (section: string): string =>
        `transition ${isLanding && activeSection === section ? 'text-white' : 'text-white/40 hover:text-white'}`

    const pageClass = (route: string): string =>
        `transition ${pathname === route || pathname.startsWith(route + '/') ? 'text-white' : 'text-white/40 hover:text-white'}`

    const handleHashClick = (e: MouseEvent, section: string): void => {
        if (isLanding) {
            e.preventDefault()
            const el = document.getElementById(section)
            if (el) el.scrollIntoView({ behavior: 'smooth' })
        }
    }

    return (
        <footer className='relative v2-section'>
            <video
                autoPlay
                loop
                muted
                playsInline
                className='v2-footer-video pointer-events-none absolute top-0 right-0 z-[1] h-full w-full'
            >
                <source
                    src='https://framerusercontent.com/assets/FsU7HaCWP7lS7TPY07jh2mCkb1o.mp4'
                    type='video/mp4'
                />
            </video>

            <div className='font-syne relative z-10 px-6 py-16 h-auto'>
                <div className='mx-auto max-w-6xl'>
                    <div className='grid gap-12 md:grid-cols-4'>
                        <div className='md:col-span-2'>
                            <LogoV2 />
                            <p className='mt-4 font-mono max-w-sm text-sm leading-relaxed text-white/40'>
                                {t('footer.productDescription')}
                            </p>
                            <div className='mt-6 flex items-center gap-3'>
                                <a
                                    href={GITHUB_REPO_URL}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    aria-label={t('footer.ariaGithub')}
                                    className='bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white'
                                >
                                    <GithubLogoIcon
                                        className='h-5 w-5'
                                        weight='fill'
                                    />
                                </a>
                                <a
                                    href={TWITTER_URL}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    aria-label={t('footer.ariaX')}
                                    className='bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white'
                                >
                                    <XLogoIcon
                                        className='h-5 w-5'
                                        weight='fill'
                                    />
                                </a>
                                <a
                                    href={FACEBOOK_URL}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    aria-label={t('footer.ariaFacebook')}
                                    className='bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white'
                                >
                                    <FacebookLogoIcon
                                        className='h-5 w-5'
                                        weight='fill'
                                    />
                                </a>
                                <a
                                    href={INSTAGRAM_URL}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    aria-label={t('footer.ariaInstagram')}
                                    className='bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white'
                                >
                                    <InstagramLogoIcon
                                        className='h-5 w-5'
                                        weight='fill'
                                    />
                                </a>
                                <a
                                    href={THREADS_URL}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    aria-label={t('footer.ariaThreads')}
                                    className='bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white'
                                >
                                    <ThreadsLogoIcon
                                        className='h-5 w-5'
                                        weight='fill'
                                    />
                                </a>
                                <a
                                    href={YOUTUBE_URL}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    aria-label={t('footer.ariaYoutube')}
                                    className='bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white'
                                >
                                    <YoutubeLogoIcon
                                        className='h-5 w-5'
                                        weight='fill'
                                    />
                                </a>
                                <a
                                    href={TIKTOK_URL}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    aria-label={t('footer.ariaTiktok')}
                                    className='bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white'
                                >
                                    <TiktokLogoIcon
                                        className='h-5 w-5'
                                        weight='fill'
                                    />
                                </a>
                            </div>
                            <p className='mt-4 font-mono text-sm text-white/30'>
                                &copy; {new Date().getFullYear()}{' '}
                                {t('footer.copyrightName')}{' '}
                                <span className='text-[11px] text-white/20'>
                                    ({__APP_VERSION__})
                                </span>
                                . {t('footer.copyrightRights')}
                            </p>
                        </div>

                        <nav aria-label={t('footer.product')}>
                            <h4 className='font-syne mb-4 font-semibold text-white'>
                                {t('footer.product')}
                            </h4>
                            <ul className='space-y-3 text-sm'>
                                <li className='font-mono'>
                                    <Link
                                        to={ROUTES.FEATURES}
                                        className={pageClass(ROUTES.FEATURES)}
                                    >
                                        {t('landing.features')}
                                    </Link>
                                </li>
                                <li className='font-mono'>
                                    <Link
                                        to={ROUTES.PRICING}
                                        className={pageClass(ROUTES.PRICING)}
                                    >
                                        {t('landing.pricing')}
                                    </Link>
                                </li>
                                <li className='font-mono'>
                                    <Link
                                        to={`${ROUTES.HOME}#comparison`}
                                        onClick={(e) =>
                                            handleHashClick(e, 'comparison')
                                        }
                                        className={hashClass('comparison')}
                                    >
                                        {t('landing.comparison')}
                                    </Link>
                                </li>
                                <li className='font-mono'>
                                    <Link
                                        to={`${ROUTES.HOME}#faq`}
                                        onClick={(e) =>
                                            handleHashClick(e, 'faq')
                                        }
                                        className={hashClass('faq')}
                                    >
                                        {t('landing.faqTitle')}
                                    </Link>
                                </li>
                            </ul>
                        </nav>

                        <nav aria-label={t('footer.legalAndMore')}>
                            <h4 className='font-syne mb-4 font-semibold text-white'>
                                {t('footer.legalAndMore')}
                            </h4>
                            <ul className='space-y-3 text-sm'>
                                <li className='font-mono'>
                                    <Link
                                        to={ROUTES.COMPARE}
                                        className={pageClass(ROUTES.COMPARE)}
                                    >
                                        {t('footer.compare')}
                                    </Link>
                                </li>
                                <li className='font-mono'>
                                    <Link
                                        to={ROUTES.CHANGELOG}
                                        className={pageClass(ROUTES.CHANGELOG)}
                                    >
                                        {t('footer.changelog')}
                                    </Link>
                                </li>
                                <li className='font-mono'>
                                    <Link
                                        to={ROUTES.PRIVACY}
                                        className={pageClass(ROUTES.PRIVACY)}
                                    >
                                        {t('footer.privacyPolicy')}
                                    </Link>
                                </li>
                                <li className='font-mono'>
                                    <Link
                                        to={ROUTES.TERMS}
                                        className={pageClass(ROUTES.TERMS)}
                                    >
                                        {t('footer.termsOfService')}
                                    </Link>
                                </li>
                                <li className='font-mono'>
                                    <Link
                                        to={ROUTES.AFFILIATE_PROGRAM}
                                        className={pageClass(
                                            ROUTES.AFFILIATE_PROGRAM
                                        )}
                                    >
                                        {t('footer.affiliateProgram')}
                                    </Link>
                                </li>
                                <li className='font-mono'>
                                    <a
                                        href={`mailto:${SUPPORT_EMAIL}`}
                                        className='text-white/40 transition hover:text-white'
                                    >
                                        {t('footer.getInTouch')}
                                    </a>
                                </li>
                            </ul>
                        </nav>
                    </div>
                </div>
            </div>
        </footer>
    )
}

export default FooterV2