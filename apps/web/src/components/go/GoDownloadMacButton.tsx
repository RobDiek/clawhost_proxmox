import type { FC, ReactNode, MouseEvent } from 'react'
import type { GoPlatformButtonProps } from '@/ts/Interfaces'
import type { MacArch } from '@/ts/Types'

import { useState } from 'react'
import { t } from '@openclaw/i18n'
import { Button } from '@/components/ui'
import { useUIStore } from '@/lib/store'
import { useMacArch } from '@/hooks'
import { downloadGoBinary } from '@/lib'
import { TOAST_TYPE, GO_PLATFORM, MAC_ARCH } from '@/lib/constants'
import { AppleLogoIcon, CircleNotchIcon } from '@phosphor-icons/react'

const PRIMARY_CLASS =
    'gap-2 border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] px-6 font-semibold text-white'
const SECONDARY_CLASS =
    'border-border text-foreground gap-2 border bg-transparent px-6 font-semibold hover:bg-white/5'

const GoDownloadMacButton: FC<GoPlatformButtonProps> = ({
    variant
}): ReactNode => {
    const [isFetching, setIsFetching] = useState(false)
    const showToast = useUIStore((s) => s.showToast)
    const detectedArch = useMacArch(true)
    const isPrimary = variant === 'primary'
    const buttonClass = isPrimary ? PRIMARY_CLASS : SECONDARY_CLASS

    const triggerDownload = async (arch: MacArch): Promise<void> => {
        if (isFetching) return
        setIsFetching(true)
        try {
            await downloadGoBinary(GO_PLATFORM.MAC, arch)
            showToast(t('go.downloadStarted'), TOAST_TYPE.SUCCESS)
        } catch (error) {
            console.error('GoDownloadMacButton', error)
            showToast(t('go.downloadFailed'), TOAST_TYPE.ERROR)
        } finally {
            setIsFetching(false)
        }
    }

    if (detectedArch === 'unknown') {
        return (
            <div className='flex flex-col items-center gap-2'>
                <p className='text-muted-foreground text-xs'>
                    {t('go.chooseMacArch')}
                </p>
                <div className='flex gap-2'>
                    <Button
                        size='lg'
                        disabled={isFetching}
                        onClick={() => triggerDownload(MAC_ARCH.ARM64)}
                        className={PRIMARY_CLASS}
                    >
                        <AppleLogoIcon className='h-5 w-5' weight='fill' />
                        <span>{t('go.appleSilicon')}</span>
                    </Button>
                    <Button
                        size='lg'
                        disabled={isFetching}
                        onClick={() => triggerDownload(MAC_ARCH.X64)}
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
        triggerDownload(detectedArch)
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