import type { FC, ReactNode } from 'react'
import type { ScrollToBottomButtonProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { ArrowDownIcon } from '@phosphor-icons/react'

const ScrollToBottomButton: FC<ScrollToBottomButtonProps> = ({
    visible,
    onClick,
    className
}): ReactNode => {
    if (!visible) return null

    return (
        <div
            className={`absolute bottom-3 left-1/2 z-10 -translate-x-1/2 ${className ?? ''}`}
        >
            <button
                onClick={onClick}
                className='border-border bg-background text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-lg transition-colors'
            >
                <ArrowDownIcon className='h-3 w-3' weight='bold' />
                {t('common.scrollToBottom')}
            </button>
        </div>
    )
}

export default ScrollToBottomButton