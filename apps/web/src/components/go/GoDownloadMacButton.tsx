import type { FC, ReactNode, MouseEvent } from 'react'
import type { GoPlatformButtonProps } from '@/ts/Interfaces'
import type { MacArch } from '@/ts/Types'

import { t } from '@openclaw/i18n'
import { Button } from '@/components/ui'
import { useGoBinaryDownload, useMacArch } from '@/hooks'
import {
    DETECTION_UNKNOWN,
    GO_PLATFORM,
    GO_PRIMARY_GRADIENT,
    MAC_ARCH
} from '@/lib/constants'
import { AppleLogoIcon, CircleNotchIcon } from '@phosphor-icons/react'

const PRIMARY_CLASS = `gap-2 ${GO_PRIMARY_GRADIENT} px-6 font-semibold`
const SECONDARY_CLASS =
    'border-border text-foreground gap-2 border bg-transparent px-6 font-semibold hover:bg-white/5'
const ATTACHED_CLASS =
    'gap-2 border-0 bg-transparent px-6 font-semibold text-white rounded-r-none hover:bg-white/10'

const GoDownloadMacButton: FC<GoPlatformButtonProps> = ({
    variant,
    attached
}): ReactNode => {
    const { trigger, isFetching } = useGoBinaryDownload('GoDownloadMacButton')
    const detectedArch = useMacArch(true)
    const isPrimary = variant === 'primary'
    const buttonClass = attached
        ? ATTACHED_CLASS
        : isPrimary
          ? PRIMARY_CLASS
          : SECONDARY_CLASS

    const downloadFor = (arch: MacArch): Promise<void> =>
        trigger(GO_PLATFORM.MAC, arch)

    if (detectedArch === DETECTION_UNKNOWN) {
        return (
            <div className='flex flex-col items-center gap-2'>
                <p className='text-muted-foreground text-xs'>
                    {t('go.chooseMacArch')}
                </p>
                <div className='flex gap-2'>
                    <Button
                        size='lg'
                        disabled={isFetching}
                        onClick={() => downloadFor(MAC_ARCH.ARM64)}
                        className={PRIMARY_CLASS}
                    >
                        <AppleLogoIcon className='h-5 w-5' weight='fill' />
                        <span>{t('go.appleSilicon')}</span>
                    </Button>
                    <Button
                        size='lg'
                        disabled={isFetching}
                        onClick={() => downloadFor(MAC_ARCH.X64)}
                        className={SECONDARY_CLASS}
                    >
                        <AppleLogoIcon className='h-5 w-5' weight='fill' />
                        <span>{t('go.intel')}</span>
                    </Button>
                </div>
            </div>
        )
    }

    const handleClick = (e: MouseEvent<HTMLButtonElement>): void => {
        e.preventDefault()
        downloadFor(detectedArch)
    }

    return (
        <Button
            size='lg'
            disabled={isFetching}
            onClick={handleClick}
            className={buttonClass}
        >
            {isFetching ? (
                <CircleNotchIcon className='h-5 w-5 animate-spin' />
            ) : (
                <AppleLogoIcon className='h-5 w-5' weight='fill' />
            )}
            <span>{t('go.downloadForMac')}</span>
        </Button>
    )
}

export default GoDownloadMacButton