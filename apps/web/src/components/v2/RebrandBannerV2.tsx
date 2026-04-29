import type { FC, ReactNode } from 'react'

import { Link } from 'react-router-dom'
import { XIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'
import { ROUTES } from '@/lib'
import { useUIStore } from '@/lib/store'

const RebrandBannerV2: FC = (): ReactNode => {
    const { rebrandBannerVisible, dismissRebrandBanner } = useUIStore()

    if (!rebrandBannerVisible) return null

    return (
        <div className='animate-banner-enter relative z-50 overflow-hidden'>
            <Link
                to={ROUTES.THE_NEW_BEGINNING}
                className='group/banner relative block border-b border-[#6B5CE7]/20 bg-[#020204] transition-colors duration-300 hover:bg-[#060510]'
            >
                <div className='absolute inset-0 bg-gradient-to-r from-[#6B5CE7]/10 via-transparent to-[#6B5CE7]/10 transition-opacity duration-300 group-hover/banner:from-[#6B5CE7]/[0.12] group-hover/banner:to-[#6B5CE7]/[0.12]' />
                <div className='absolute inset-0 overflow-hidden'>
                    <div className='absolute -left-4 top-1/2 h-px w-16 -translate-y-1/2 bg-gradient-to-r from-transparent to-[#6B5CE7]/30 transition-all duration-300 group-hover/banner:w-20 group-hover/banner:to-[#6B5CE7]/40' />
                    <div className='absolute -right-4 top-1/2 h-px w-16 -translate-y-1/2 bg-gradient-to-l from-transparent to-[#6B5CE7]/30 transition-all duration-300 group-hover/banner:w-20 group-hover/banner:to-[#6B5CE7]/40' />
                </div>
                <div className='relative px-4 py-2.5 text-center'>
                    <span className='inline-flex items-center gap-3'>
                        <span className='hidden font-mono text-[10px] tracking-[0.3em] text-[#6B5CE7] sm:inline'>
                            // {t('rebrand.tag')}
                        </span>
                        <span className='hidden text-white/10 sm:inline'>|</span>
                        <span className='text-sm text-white/90'>
                            <span className='font-syne font-bold'>{t('rebrand.title')}</span>
                            <span className='text-white/30'>{' \u2002—\u2002 '}</span>
                            <span className='text-white/50'>{t('rebrand.mission')}</span>
                        </span>
                        <ArrowRightIcon size={12} className='hidden text-[#6B5CE7] transition-transform duration-300 group-hover/banner:translate-x-1 sm:inline' />
                    </span>
                    <button
                        onClick={(e) => {
                            e.preventDefault()
                            dismissRebrandBanner()
                        }}
                        className='absolute right-4 top-1/2 -translate-y-1/2 text-white/20 transition hover:text-white/50'
                        aria-label={t('common.close')}
                    >
                        <XIcon size={14} />
                    </button>
                </div>
            </Link>
        </div>
    )
}

export default RebrandBannerV2