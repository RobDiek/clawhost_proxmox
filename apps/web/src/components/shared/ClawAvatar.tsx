import type { FC, ReactNode } from 'react'
import type { ClawAvatarProps } from '@/ts/Interfaces'

import ClawMascot from '@/components/shared/ClawMascot'
import { CLAW_AVATAR_SIZE } from '@/lib/constants'

const sizeMap = {
    [CLAW_AVATAR_SIZE.SM]: {
        container: 'h-8 w-8 rounded-lg',
        icon: 'h-4 w-4',
        emoji: 'text-base'
    },
    [CLAW_AVATAR_SIZE.MD]: {
        container: 'h-10 w-10 rounded-xl',
        icon: 'h-5 w-5',
        emoji: 'text-xl'
    },
    [CLAW_AVATAR_SIZE.LG]: {
        container: 'h-12 w-12 rounded-xl',
        icon: 'h-6 w-6',
        emoji: 'text-2xl'
    }
}

const ClawAvatar: FC<ClawAvatarProps> = ({
    emoji,
    emojiColor,
    size = CLAW_AVATAR_SIZE.MD,
    className = ''
}): ReactNode => {
    const s = sizeMap[size]

    return (
        <div
            className={`flex shrink-0 items-center justify-center ${!emojiColor ? 'bg-muted' : ''} ${s.container} ${className}`}
            style={emojiColor ? { backgroundColor: emojiColor } : undefined}
        >
            {emoji ? (
                <span className={s.emoji}>{emoji}</span>
            ) : (
                <ClawMascot className={s.icon} />
            )}
        </div>
    )
}

export default ClawAvatar