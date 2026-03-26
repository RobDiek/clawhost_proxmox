import type { FC, ReactNode } from 'react'
import type { ClawAvatarProps } from '@/ts/Interfaces'

import ClawMascot from '@/components/shared/ClawMascot'

const sizeMap = {
    sm: { container: 'h-8 w-8 rounded-lg', icon: 'h-4 w-4' },
    md: { container: 'h-10 w-10 rounded-xl', icon: 'h-5 w-5' },
    lg: { container: 'h-12 w-12 rounded-xl', icon: 'h-6 w-6' }
}

const ClawAvatar: FC<ClawAvatarProps> = ({
    size = 'md',
    className = ''
}): ReactNode => {
    const s = sizeMap[size]

    return (
        <div
            className={`bg-muted flex shrink-0 items-center justify-center ${s.container} ${className}`}
        >
            <ClawMascot className={s.icon} />
        </div>
    )
}

export default ClawAvatar