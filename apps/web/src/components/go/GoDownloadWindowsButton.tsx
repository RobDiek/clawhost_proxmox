import type { FC, ReactNode, MouseEvent } from 'react'
import type { GoPlatformButtonProps } from '@/ts/Interfaces'

import { useState } from 'react'
import { t } from '@openclaw/i18n'
import { Button } from '@/components/ui'
import { useUIStore } from '@/lib/store'
import { downloadGoBinary } from '@/lib'
import { TOAST_TYPE, GO_PLATFORM } from '@/lib/constants'
import { WindowsLogoIcon, CircleNotchIcon } from '@phosphor-icons/react'

const GoDownloadWindowsButton: FC<GoPlatformButtonProps> = ({
    variant
}): ReactNode => {
    const [isFetching, setIsFetching] = useState(false)
    const showToast = useUIStore((s) => s.showToast)
    const isPrimary = variant === 'primary'
    const buttonClass = isPrimary
        ? 'gap-2 border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] px-6 font-semibold text-white'
        : 'border-border text-foreground gap-2 border bg-transparent px-6 font-semibold hover:bg-white/5'

    const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        if (isFetching) return
        setIsFetching(true)
        try {
            await downloadGoBinary(GO_PLATFORM.WINDOWS)
            showToast(t('go.downloadStarted'), TOAST_TYPE.SUCCESS)
        } catch (error) {
            console.error('GoDownloadWindowsButton', error)
            showToast(t('go.downloadFailed'), TOAST_TYPE.ERROR)
        } finally {
            setIsFetching(false)
        }
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
                <WindowsLogoIcon className='h-5 w-5' weight='fill' />
            )}
            <span>{t('go.downloadForWindows')}</span>
        </Button>
    )
}

export default GoDownloadWindowsButton