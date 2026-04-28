import type { FC, ReactNode } from 'react'

import { XIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'
import { useUIStore } from '@/lib/store'

const RebrandBannerV2: FC = (): ReactNode => {
    const { rebrandBannerVisible, dismissRebrandBanner } = useUIStore()

    if (!rebrandBannerVisible) return null

    return (
        <div className='animate-banner-enter relative z-50 overflow-hidden'>
            <div className='relative border-b border-[#6B5CE7]/20 bg-[#0a0a0f]'>
                <div className='absolute inset-0 bg-gradient-to-r from-[#6B5CE7]/10 via-transparent to-[#6B5CE7]/10' />
                <div className='absolute inset-0 overflow-hidden'>
                    <div className='absolute -left-4 top-1/2 h-px w-16 -translate-y-1/2 bg-gradient-to-r from-transparent to-[#6B5CE7]/30' />
                    <div className='absolute -right-4 top-1/2 h-px w-16 -translate-y-1/2 bg-gradient-to-l from-transparent to-[#6B5CE7]/30' />
                </div>
                <div className='relative px-4 py-2.5 text-center'>
                    <div className='inline-flex items-center gap-3'>
                        <span className='hidden font-mono text-[10px] tracking-[0.3em] text-[#6B5CE7] sm:inline'>
                            // {t('rebrand.tag')}
                        </span>
                        <span className='hidden text-white/10 sm:inline'>|</span>
                        <span className='text-sm text-white/90'>
                            <span className='font-syne font-bold'>{t('rebrand.title')}</span>
                            <span className='text-white/30'>{' \u2002—\u2002 '}</span>
                            <span className='text-white/50'>{t('rebrand.mission')}</span>
                        </span>
                        <ArrowRightIcon size={12} className='hidden text-[#6B5CE7] sm:inline' />
                    </div>
                    <button
                        onClick={dismissRebrandBanner}
                        className='absolute right-4 top-1/2 -translate-y-1/2 text-white/20 transition hover:text-white/50'
                        aria-label={t('common.close')}
                    >
                        <XIcon size={14} />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default RebrandBannerV2