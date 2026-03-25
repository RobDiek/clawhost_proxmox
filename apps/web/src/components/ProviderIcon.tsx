import type { FC, ReactNode } from 'react'
import type { ProviderIconProps } from '@/ts/Interfaces'

import { clawProvider } from '@openclaw/shared'

const ProviderIcon: FC<ProviderIconProps> = ({
    provider,
    className
}): ReactNode => {
    if (provider === clawProvider.hetzner) {
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

    if (provider === clawProvider.local) {
        return (
            <svg
                className={className || 'h-4 w-4'}
                viewBox='0 0 24 24'
                fill='none'
            >
                <rect width='24' height='24' rx='12' fill='#ef5350' />
                <path
                    d='M7 8h10v6H7zM9 14v2M15 14v2M6 16h12'
                    stroke='white'
                    strokeWidth='1.5'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                />
            </svg>
        )
    }

    return null
}

export default ProviderIcon