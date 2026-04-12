import type { FC, ReactNode } from 'react'
import type { UpdateAvailableBannerProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { OPENCLAW_VERSION } from '@openclaw/shared'

const UpdateAvailableBanner: FC<UpdateAvailableBannerProps> = ({
    onGoToVersions
}): ReactNode => {
    return (
        <div className='bg-foreground/5 mb-3 flex items-center justify-between rounded-lg px-3 py-2.5'>
            <p className='text-muted-foreground text-xs'>
                {t('clawDetail.updateAvailableDescription', {
                    version: OPENCLAW_VERSION
                })}
            </p>
            <button
                onClick={onGoToVersions}
                className='border-border text-foreground hover:bg-foreground/5 shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors'
            >
                {t('clawDetail.goToVersions')}
            </button>
        </div>
    )
}

export default UpdateAvailableBanner