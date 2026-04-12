import type { FC, ReactNode } from 'react'
import type { UpdateAvailableBannerProps } from '@/ts/Interfaces'

import { InfoIcon } from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'

const UpdateAvailableBanner: FC<UpdateAvailableBannerProps> = ({
    latestVersion,
    onGoToVersions
}): ReactNode => {
    return (
        <div className='border-border flex items-center gap-2 border-b px-3.5 py-2.5'>
            <InfoIcon size={14} className='text-muted-foreground shrink-0' />
            <p className='text-muted-foreground flex-1 text-xs'>
                {t('clawDetail.updateAvailableDescription', {
                    version: latestVersion
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