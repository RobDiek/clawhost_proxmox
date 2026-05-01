import type { FC, ReactNode } from 'react'
import type { BetaBadgeProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'

const BetaBadge: FC<BetaBadgeProps> = ({ version }): ReactNode => {
    return (
        <span className='bg-muted text-muted-foreground -ml-1.5 self-center rounded-full px-1.5 py-0.5 text-[8px] font-medium tracking-wider'>
            {version || t('common.beta')}
        </span>
    )
}

export default BetaBadge