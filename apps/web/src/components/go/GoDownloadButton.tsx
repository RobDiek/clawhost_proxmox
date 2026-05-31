import type { FC, ReactNode } from 'react'
import type { GoDownloadButtonProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { useDetectedOS } from '@/hooks'
import { GO_PLATFORM, GO_PRIMARY_GRADIENT } from '@/lib/constants'
import {
    GoDownloadMacButton,
    GoDownloadVariantsDropdown,
    GoDownloadWindowsButton
} from '@/components/go'

const SPLIT_WRAPPER = `inline-flex items-stretch rounded-lg ${GO_PRIMARY_GRADIENT}`

const GoDownloadButton: FC<GoDownloadButtonProps> = ({
    className
}): ReactNode => {
    const detectedOS = useDetectedOS()
    const isMac = detectedOS === GO_PLATFORM.MAC
    const isWindows = detectedOS === GO_PLATFORM.WINDOWS

    return (
        <div
            className={
                className || 'flex flex-col items-center justify-center gap-2'
            }
        >
            {isMac ? (
                <div className={SPLIT_WRAPPER}>
                    <GoDownloadMacButton variant='primary' attached />
                    <GoDownloadVariantsDropdown attached />
                </div>
            ) : isWindows ? (
                <div className={SPLIT_WRAPPER}>
                    <GoDownloadWindowsButton variant='primary' attached />
                    <GoDownloadVariantsDropdown attached />
                </div>
            ) : (
                <div className='flex flex-col items-center gap-2'>
                    <p className='text-muted-foreground text-sm'>
                        {t('go.deviceNotSupported')}
                    </p>
                    <GoDownloadVariantsDropdown />
                </div>
            )}
        </div>
    )
}

export default GoDownloadButton