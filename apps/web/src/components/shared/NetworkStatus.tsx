import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { WifiSlashIcon } from '@phosphor-icons/react'

const NetworkStatus: FC = (): ReactNode => {
    return (
        <div className='animate-banner-enter relative z-50 overflow-hidden'>
            <div className='relative border-b border-red-500/10 bg-white dark:bg-[#0a0a0f]'>
                <div className='absolute inset-0 bg-gradient-to-r from-red-500/5 via-transparent to-red-500/5 dark:from-red-500/10 dark:to-red-500/10' />
                <div className='relative px-4 pb-2 pt-3 text-center text-sm leading-6'>
                    <p className='inline'>
                        <span className='mb-[3px] inline-flex items-center gap-2 align-middle'>
                            <WifiSlashIcon
                                size={16}
                                weight='fill'
                                className='text-red-500'
                            />
                            <span className='font-semibold text-red-500'>
                                {t('network.offline')}
                            </span>
                        </span>
                        <span className='text-foreground/30'>
                            {' \u2002—\u2002 '}
                        </span>
                        <span className='text-foreground/60'>
                            {t('network.offlineDescription')}
                        </span>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default NetworkStatus