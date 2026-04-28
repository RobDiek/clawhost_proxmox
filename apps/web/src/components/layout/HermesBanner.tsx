import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { useUIStore } from '@/lib/store'
import { HermesIcon } from '@/components/icons'

const HermesBanner: FC = (): ReactNode => {
    const { hermesBannerVisible } = useUIStore()

    if (!hermesBannerVisible) return null

    return (
        <div className='animate-banner-enter relative z-50 overflow-hidden'>
            <div className='relative border-b border-white/5 bg-[#111114]'>
                <div className='relative px-4 pb-2 pt-3 text-center text-sm leading-6'>
                    <p className='inline'>
                        <span className='mb-[3px] inline-flex items-center gap-2 align-middle'>
                            <HermesIcon size={16} />
                            <span className='font-semibold text-white'>
                                {t('hermesBanner.title')}
                            </span>
                        </span>
                        <span className='text-white/30'>
                            {' \u2002—\u2002 '}
                        </span>
                        <span className='text-white/70'>
                            {t('hermesBanner.message')}
                        </span>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default HermesBanner