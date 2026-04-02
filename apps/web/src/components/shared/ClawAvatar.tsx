import type { FC, ReactNode } from 'react'
import type { ClawAvatarProps } from '@/ts/Interfaces'

import ClawMascot from '@/components/shared/ClawMascot'
import { CLAW_AVATAR_SIZE } from '@/lib/constants'

const sizeMap = {
    [CLAW_AVATAR_SIZE.SM]: { container: 'h-8 w-8 rounded-lg', icon: 'h-4 w-4' },
    [CLAW_AVATAR_SIZE.MD]: {
        container: 'h-10 w-10 rounded-xl',
        icon: 'h-5 w-5'
    },
    [CLAW_AVATAR_SIZE.LG]: {
        container: 'h-12 w-12 rounded-xl',
        icon: 'h-6 w-6'
    }
}

const ClawAvatar: FC<ClawAvatarProps> = ({
    size = CLAW_AVATAR_SIZE.MD,
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