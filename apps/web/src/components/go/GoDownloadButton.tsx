import type { FC, ReactNode } from 'react'
import type { GoDownloadButtonProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { useDetectedOS } from '@/hooks'
import { GO_PLATFORM } from '@/lib/constants'
import GoDownloadMacButton from '@/components/go/GoDownloadMacButton'
import GoDownloadWindowsButton from '@/components/go/GoDownloadWindowsButton'

const GoDownloadButton: FC<GoDownloadButtonProps> = ({
    className
}): ReactNode => {
    const detectedOS = useDetectedOS()

    return (
        <div
            className={
                className || 'flex flex-col items-center justify-center gap-2'
            }
        >
            {detectedOS === GO_PLATFORM.MAC ? (
                <GoDownloadMacButton variant='primary' />
            ) : detectedOS === GO_PLATFORM.WINDOWS ? (
                <GoDownloadWindowsButton variant='primary' />
            ) : (
                <p className='text-muted-foreground text-sm'>
                    {t('go.deviceNotSupported')}
                </p>
            )}
        </div>
    )
}

export default GoDownloadButton