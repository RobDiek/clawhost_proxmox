import type { FC, ReactNode, MouseEvent } from 'react'
import type { GoPlatformButtonProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Button } from '@/components/ui'
import { useGoBinaryDownload } from '@/hooks'
import { GO_PLATFORM, GO_PRIMARY_GRADIENT } from '@/lib/constants'
import { WindowsLogoIcon, CircleNotchIcon } from '@phosphor-icons/react'

const PRIMARY_CLASS = `gap-2 ${GO_PRIMARY_GRADIENT} px-6 font-semibold`
const SECONDARY_CLASS =
    'border-border text-foreground gap-2 border bg-transparent px-6 font-semibold hover:bg-white/5'
const ATTACHED_CLASS =
    'gap-2 border-0 bg-transparent px-6 font-semibold text-white rounded-r-none hover:bg-white/10'

const GoDownloadWindowsButton: FC<GoPlatformButtonProps> = ({
    variant,
    attached
}): ReactNode => {
    const { trigger, isFetching } = useGoBinaryDownload(
        'GoDownloadWindowsButton'
    )
    const isPrimary = variant === 'primary'
    const buttonClass = attached
        ? ATTACHED_CLASS
        : isPrimary
          ? PRIMARY_CLASS
          : SECONDARY_CLASS

    const handleClick = (e: MouseEvent<HTMLButtonElement>): void => {
        e.preventDefault()
        trigger(GO_PLATFORM.WINDOWS)
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