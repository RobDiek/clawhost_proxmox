import type { FC, ReactNode } from 'react'
import type { GoDownloadVariantsDropdownProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    AppleLogoIcon,
    CaretDownIcon,
    CircleNotchIcon,
    WindowsLogoIcon
} from '@phosphor-icons/react'
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui'
import { useGoBinaryDownload } from '@/hooks'
import {
    GO_PLATFORM,
    GO_PRIMARY_GRADIENT,
    MAC_ARCH
} from '@/lib/constants'

const STANDALONE_CLASS = `h-10 rounded-lg ${GO_PRIMARY_GRADIENT} px-3 font-semibold`
const ATTACHED_CLASS =
    'h-10 rounded-l-none rounded-r-lg border-0 bg-transparent px-3 font-semibold text-white hover:bg-white/10'

const GoDownloadVariantsDropdown: FC<GoDownloadVariantsDropdownProps> = ({
    attached
}): ReactNode => {
    const { trigger, isFetching } = useGoBinaryDownload(
        'GoDownloadVariantsDropdown'
    )
    const buttonClass = attached ? ATTACHED_CLASS : STANDALONE_CLASS

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    size='lg'
                    disabled={isFetching}
                    aria-label={t('go.otherVersions')}
                    className={buttonClass}
                >
                    {isFetching ? (
                        <CircleNotchIcon className='h-4 w-4 animate-spin' />
                    ) : (
                        <CaretDownIcon className='h-4 w-4' weight='bold' />
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-56'>
                <DropdownMenuItem
                    onClick={() => trigger(GO_PLATFORM.MAC, MAC_ARCH.ARM64)}
                >
                    <AppleLogoIcon className='mr-2 h-4 w-4' weight='fill' />
                    <span>{t('go.appleSilicon')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => trigger(GO_PLATFORM.MAC, MAC_ARCH.X64)}
                >
                    <AppleLogoIcon className='mr-2 h-4 w-4' weight='fill' />
                    <span>{t('go.intel')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => trigger(GO_PLATFORM.WINDOWS)}>
                    <WindowsLogoIcon className='mr-2 h-4 w-4' weight='fill' />
                    <span>{t('go.downloadForWindows')}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export default GoDownloadVariantsDropdown