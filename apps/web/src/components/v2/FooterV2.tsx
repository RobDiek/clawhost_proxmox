import type { FC, ReactNode } from 'react'
import type { FooterSocialLink, FooterRouteLink } from '@/ts/Interfaces'

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

const socialLinks: FooterSocialLink[] = [
    { url: GITHUB_REPO_URL, ariaKey: 'footer.ariaGithub', Icon: GithubLogoIcon },
    { url: TWITTER_URL, ariaKey: 'footer.ariaX', Icon: XLogoIcon },
    { url: FACEBOOK_URL, ariaKey: 'footer.ariaFacebook', Icon: FacebookLogoIcon },
    { url: INSTAGRAM_URL, ariaKey: 'footer.ariaInstagram', Icon: InstagramLogoIcon },
    { url: THREADS_URL, ariaKey: 'footer.ariaThreads', Icon: ThreadsLogoIcon },
    { url: YOUTUBE_URL, ariaKey: 'footer.ariaYoutube', Icon: YoutubeLogoIcon },
    { url: TIKTOK_URL, ariaKey: 'footer.ariaTiktok', Icon: TiktokLogoIcon }
]

const productLinks: FooterRouteLink[] = [
    { route: ROUTES.FEATURES, labelKey: 'landing.features' },
    { route: ROUTES.PRICING, labelKey: 'landing.pricing' },
    { route: ROUTES.COMPARE, labelKey: 'landing.comparison' },
    { route: ROUTES.GO, labelKey: 'nav.agentistGo' }
]

const legalLinks: FooterRouteLink[] = [
    { route: ROUTES.CHANGELOG, labelKey: 'footer.changelog' },
    { route: ROUTES.PRIVACY, labelKey: 'footer.privacyPolicy' },
    { route: ROUTES.TERMS, labelKey: 'footer.termsOfService' },
    { route: ROUTES.AFFILIATE_PROGRAM, labelKey: 'footer.affiliateProgram' }
]

const FooterV2: FC = (): ReactNode => {
    const { pathname } = useLocation()

    const pageClass = (route: string): string =>
        `transition ${pathname === route || pathname.startsWith(route + '/') ? 'text-white' : 'text-white/40 hover:text-white'}`

    return (
        <footer className='relative v2-section overflow-visible'>
            <video
                autoPlay
                loop
                muted
                playsInline
                className='v2-footer-video pointer-events-none absolute inset-0 z-[1] h-full w-full object-[left_bottom]'
            >
                <source
                    src='https://framerusercontent.com/assets/FsU7HaCWP7lS7TPY07jh2mCkb1o.mp4'
                    type='video/mp4'
                />
            </video>
            <div className='pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(to_bottom,#020204_0%,rgba(2,2,4,0.6)_40%,transparent_70%,#020204_100%)]' />

            <div className='font-syne relative z-10 px-6 py-16 h-auto'>
                <div className='mx-auto max-w-6xl'>
                    <div className='grid gap-12 md:grid-cols-4'>
                        <div className='md:col-span-2'>
                            <LogoV2 />
                            <p className='mt-4 font-mono max-w-sm text-sm leading-relaxed text-white/40'>
                                {t('v2.footerDescription')}
                            </p>
                            <div className='mt-6 flex items-center gap-3'>
                                {socialLinks.map((link) => (
                                    <a
                                        key={link.ariaKey}
                                        href={link.url}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        aria-label={t(link.ariaKey)}
                                        className='bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white'
                                    >
                                        <link.Icon
                                            className='h-5 w-5'
                                            weight='fill'
                                        />
                                    </a>
                                ))}
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
                                {productLinks.map((link) => (
                                    <li key={link.route} className='font-mono'>
                                        <Link
                                            to={link.route}
                                            className={pageClass(link.route)}
                                        >
                                            {t(link.labelKey)}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        <nav aria-label={t('footer.legalAndMore')}>
                            <h4 className='font-syne mb-4 font-semibold text-white'>
                                {t('footer.legalAndMore')}
                            </h4>
                            <ul className='space-y-3 text-sm'>
                                {legalLinks.map((link) => (
                                    <li key={link.route} className='font-mono'>
                                        <Link
                                            to={link.route}
                                            className={pageClass(link.route)}
                                        >
                                            {t(link.labelKey)}
                                        </Link>
                                    </li>
                                ))}
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