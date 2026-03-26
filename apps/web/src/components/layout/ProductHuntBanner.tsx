import type { FC, ReactNode } from 'react'

import { XIcon, ArrowUpIcon } from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'
import { PRODUCT_HUNT_URL } from '@/lib/links'
import { useUIStore } from '@/lib/store'

const ProductHuntBanner: FC = (): ReactNode => {
    const { phBannerVisible, dismissPhBanner } = useUIStore()

    if (!phBannerVisible) return null

    return (
        <div className='animate-banner-enter relative z-50 overflow-hidden'>
            <div className='relative border-b border-[#ff6154]/10 bg-white dark:bg-[#0a0a0f]'>
                <div className='absolute inset-0 bg-gradient-to-r from-[#ef5350]/5 via-transparent to-[#ff6154]/5 dark:from-[#ef5350]/10 dark:to-[#ff6154]/10' />
                <div className='relative px-4 pb-2 pt-3 text-center text-sm leading-6'>
                    <p className='inline'>
                        <span className='mb-[3px] inline-flex items-center gap-2 align-middle'>
                            <span className='text-foreground/50 hidden sm:inline'>
                                {t('productHunt.liveOn')}
                            </span>
                            <span className='inline-flex items-center gap-1.5 font-semibold text-[#ff6154]'>
                                <svg
                                    width='16'
                                    height='16'
                                    viewBox='0 0 256 256'
                                >
                                    <defs>
                                        <linearGradient
                                            x1='50%'
                                            y1='0%'
                                            x2='50%'
                                            y2='100%'
                                            id='ph-gradient'
                                        >
                                            <stop
                                                stopColor='#DA552F'
                                                offset='0%'
                                            />
                                            <stop
                                                stopColor='#D04B25'
                                                offset='100%'
                                            />
                                        </linearGradient>
                                    </defs>
                                    <path
                                        d='M128,256 C198.6944,256 256,198.6944 256,128 C256,57.3056 198.6944,0 128,0 C57.3056,0 0,57.3056 0,128 C0,198.6944 57.3056,256 128,256 L128,256 Z'
                                        fill='url(#ph-gradient)'
                                    />
                                    <path
                                        d='M96,76.8 L96,179.2 L115.2,179.2 L115.2,147.2 L144.256,147.2 C163.552,146.688 179.2,131.04 179.2,112 C179.2,92.448 163.552,76.8 144.256,76.8 L96,76.8 L96,76.8 Z M144.4928,128 L115.2,128 L115.2,96 L144.4928,96 C153.056,96 160,103.168 160,112 C160,120.832 153.056,128 144.4928,128 L144.4928,128 Z'
                                        fill='#FFFFFF'
                                    />
                                </svg>
                                {t('productHunt.productHunt')}
                            </span>
                        </span>
                        <span className='text-foreground/30 hidden sm:inline'>
                            {' \u2002—\u2002 '}
                        </span>
                        <span className='text-foreground/60 hidden sm:inline'>
                            {t('productHunt.celebrate')}{' '}
                        </span>
                        <span className='text-foreground/60 sm:font-bold sm:text-[#ff6154]'>
                            {' '}
                            {t('productHunt.discount')}
                        </span>
                        <span className='text-foreground/60 hidden sm:inline'>
                            {' '}
                            {t('productHunt.yourFirstMonth')}.
                        </span>
                    </p>
                    <a
                        href={PRODUCT_HUNT_URL}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='mb-1 ml-3 inline-flex items-center gap-1.5 rounded-md bg-[#ff6154] px-3 py-1 align-middle text-xs font-semibold text-white transition-all hover:bg-[#ff6154]/90 hover:shadow-[0_0_12px_rgba(255,97,84,0.4)]'
                    >
                        <ArrowUpIcon size={12} weight='bold' />
                        {t('productHunt.upvoteNow')}
                    </a>
                    <button
                        onClick={dismissPhBanner}
                        className='text-foreground/30 hover:text-foreground/60 absolute right-4 top-1/2 -translate-y-1/2 transition'
                        aria-label={t('common.close')}
                    >
                        <XIcon size={14} />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ProductHuntBanner