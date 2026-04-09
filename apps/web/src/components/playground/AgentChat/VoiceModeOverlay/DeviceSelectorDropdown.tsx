import type { FC, ReactNode } from 'react'
import type { DeviceSelectorDropdownProps } from '@/ts/Interfaces'

import { CaretDownIcon, WarningIcon } from '@phosphor-icons/react'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem
} from '@/components/ui'

const truncateLabel = (label: string, max: number): string =>
    label.length > max ? label.slice(0, max) + '...' : label

const DeviceSelectorDropdown: FC<DeviceSelectorDropdownProps> = ({
    icon,
    label,
    value,
    onValueChange,
    devices,
    fallbackLabel,
    emptyLabel
}): ReactNode => {
    const displayLabel = truncateLabel(label || fallbackLabel, 12)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className='flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/60 outline-none transition-colors hover:bg-white/10'>
                    {icon}
                    <span>{displayLabel}</span>
                    <CaretDownIcon className='h-3 w-3 shrink-0 opacity-50' />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='max-w-[240px]'>
                <DropdownMenuRadioGroup
                    value={value}
                    onValueChange={onValueChange}
                >
                    {devices.map((d) => (
                        <DropdownMenuRadioItem
                            key={d.deviceId}
                            value={d.deviceId}
                        >
                            <span className='truncate'>
                                {d.label || fallbackLabel}
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                {devices.length === 0 && (
                    <div className='text-muted-foreground flex items-center gap-2 px-2.5 py-2 text-xs'>
                        <WarningIcon
                            className='h-3.5 w-3.5 shrink-0 text-[#ef5350]'
                            weight='fill'
                        />
                        {emptyLabel}
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export default DeviceSelectorDropdown