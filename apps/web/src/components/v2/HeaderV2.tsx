import type { FC, ReactNode } from 'react'
import type { HeaderProps } from '@/ts/Interfaces'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { ListIcon, XIcon } from '@phosphor-icons/react'
import { LanguageSelector, ThemeToggle, UserDropdown } from '@/components'
import LogoV2 from '@/components/v2/LogoV2'
import RebrandBannerV2 from '@/components/v2/RebrandBannerV2'
import { ROUTES } from '@/lib'
import { useAuth } from '@/lib/auth'
import { useProfile } from '@/hooks'
import { Skeleton } from '@/components/ui'

const HeaderV2: FC<HeaderProps> = ({
    showNavLinks = false,
    navLinks = [],
    activeSection = ''
}): ReactNode => {
    const { user, loading: authLoading, cachedProfile, signOut } = useAuth()
    const [scrolled, setScrolled] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50)
        }
        window.addEventListener('scroll', handleScroll)
        handleScroll()
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    useEffect(() => {
        if (!mobileMenuOpen) return
        const onScroll = () => setMobileMenuOpen(false)
        window.addEventListener('scroll', onScroll)
        return () => window.removeEventListener('scroll', onScroll)
    }, [mobileMenuOpen])

    const { data: profile } = useProfile({
        enabled: !!user
    })

    const displayName =
        profile?.name ||
        cachedProfile?.name ||
        user?.email ||
        cachedProfile?.email ||
        ''

    return (
        <Fragment>
            <header
                className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
                    mobileMenuOpen
                        ? 'border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl'
                        : scrolled
                          ? 'border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl'
                          : 'border-b border-transparent bg-transparent'
                }`}
            >
                <RebrandBannerV2 />
                <div className='mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4'>
                    <LogoV2 />

                    {showNavLinks && navLinks.length > 0 && (
                        <nav
                            className='hidden items-center justify-center gap-8 md:flex'
                            aria-label={t('nav.mainNavigation')}
                        >
                            {navLinks.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    aria-current={
                                        activeSection === link.id
                                            ? 'true'
                                            : undefined
                                    }
                                    className={`font-mono text-xs uppercase tracking-[0.1em] transition ${
                                        activeSection === link.id
                                            ? 'text-white'
                                            : 'text-white/40 hover:text-white'
                                    }`}
                                >
                                    {link.label}
                                </a>
                            ))}
                        </nav>
                    )}

                    <div className='flex items-center gap-3'>
                        <div className='hidden items-center gap-1.5 sm:flex'>
                            <LanguageSelector />
                            <ThemeToggle />
                        </div>
                        {authLoading && !cachedProfile ? (
                            <Skeleton className='h-8 w-20 bg-white/10' />
                        ) : user || cachedProfile ? (
                            <UserDropdown
                                displayName={displayName}
                                onSignOut={signOut}
                                onOpen={closeMobileMenu}
                            />
                        ) : (
                            <div className='flex items-center gap-3'>
                                <Link
                                    to={ROUTES.LOGIN}
                                    className='hidden font-mono text-xs text-white/50 transition hover:text-white sm:block'
                                >
                                    {t('nav.login')}
                                </Link>
                                <Link
                                    to={ROUTES.LOGIN}
                                    className='bg-[#6B5CE7] px-4 py-2 font-mono text-xs tracking-[0.1em] text-white transition hover:bg-[#5a4bd6]'
                                >
                                    {t('nav.deploy')}
                                </Link>
                            </div>
                        )}
                        {showNavLinks && navLinks.length > 0 && (
                            <button
                                onClick={() =>
                                    setMobileMenuOpen(!mobileMenuOpen)
                                }
                                aria-label={t('nav.toggleMenu')}
                                aria-expanded={mobileMenuOpen}
                                className='p-1.5 text-white/50 transition-colors hover:text-white md:hidden'
                            >
                                {mobileMenuOpen ? (
                                    <XIcon className='h-5 w-5' weight='bold' />
                                ) : (
                                    <ListIcon
                                        className='h-5 w-5'
                                        weight='bold'
                                    />
                                )}
                            </button>
                        )}
                    </div>
                </div>

                <AnimatePresence>
                    {mobileMenuOpen && showNavLinks && navLinks.length > 0 && (
                        <Fragment>
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className='border-b border-white/5 bg-[#0a0a0f] px-6 pb-6 pt-2 md:hidden'
                            >
                                <nav className='flex flex-col gap-1'>
                                    {navLinks.map((link) => (
                                        <a
                                            key={link.href}
                                            href={link.href}
                                            onClick={closeMobileMenu}
                                            className={`px-3 py-2.5 font-mono text-xs uppercase tracking-[0.1em] transition ${
                                                activeSection === link.id
                                                    ? 'bg-white/5 text-white'
                                                    : 'text-white/40 hover:bg-white/5 hover:text-white'
                                            }`}
                                        >
                                            {link.label}
                                        </a>
                                    ))}
                                </nav>
                                <div className='flex items-center gap-1.5 border-t border-white/5 pt-4 sm:hidden'>
                                    <LanguageSelector />
                                    <ThemeToggle />
                                </div>
                            </motion.div>
                        </Fragment>
                    )}
                </AnimatePresence>
            </header>

            <AnimatePresence>
                {mobileMenuOpen && showNavLinks && navLinks.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className='fixed inset-0 z-40 md:hidden'
                        onClick={closeMobileMenu}
                    />
                )}
            </AnimatePresence>
        </Fragment>
    )
}

export default HeaderV2