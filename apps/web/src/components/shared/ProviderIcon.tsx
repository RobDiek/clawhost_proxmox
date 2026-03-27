import type { FC, ReactNode } from 'react'
import type { ProviderIconProps } from '@/ts/Interfaces'

const ProviderIcon: FC<ProviderIconProps> = ({
    className
}): ReactNode => {
    return (
        <svg
            className={className || 'h-4 w-4'}
            viewBox='0 0 63 64'
            fill='none'
        >
            <rect width='63' height='64' rx='31.5' fill='#D50C2D' />
            <path
                d='M17 20h10v24H17zM36 20h10v24H36zM27 30h9v4h-9z'
                fill='white'
            />
        </svg>
    )
}

export default ProviderIcon