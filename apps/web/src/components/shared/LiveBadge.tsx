import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { CircleNotchIcon } from '@phosphor-icons/react'

const LiveBadge: FC = (): ReactNode => {
    return (
        <div className='flex w-fit items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600 dark:text-green-400'>
            <CircleNotchIcon className='h-3 w-3 animate-spin' />
            {t('clawDetail.metricsLive')}
        </div>
    )
}

export default LiveBadge