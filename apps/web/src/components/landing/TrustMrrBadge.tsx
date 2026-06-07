import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'

const TrustMrrBadge: FC = (): ReactNode => {
    return (
        <a href='https://trustmrr.com/startup/clawnode' target='_blank'>
            <img
                src='https://trustmrr.com/api/embed/clawnode?format=svg&theme=light'
                alt={t('landing.trustMrrBadgeAlt')}
                width='171'
                height='70'
                loading='lazy'
                className='block dark:hidden'
            />
            <img
                src='https://trustmrr.com/api/embed/clawnode?format=svg&theme=dark'
                alt={t('landing.trustMrrBadgeAlt')}
                width='171'
                height='70'
                loading='lazy'
                className='hidden dark:block'
            />
        </a>
    )
}

export default TrustMrrBadge