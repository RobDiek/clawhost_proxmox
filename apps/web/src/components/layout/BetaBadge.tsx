import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'

const BetaBadge: FC = (): ReactNode => {
    return (
        <span className='bg-muted text-muted-foreground -ml-1.5 self-center rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-widest'>
            {t('common.beta')}
        </span>
    )
}

export default BetaBadge