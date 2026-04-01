import type { FC, ReactNode } from 'react'
import type { ChatTypingIndicatorProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { BrainIcon } from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'
import { CHAT_TYPING_INDICATOR } from '@/lib/constants'

const ChatTypingIndicator: FC<ChatTypingIndicatorProps> = ({
    state
}): ReactNode => {
    if (!state) return null

    return (
        <div className='flex justify-start'>
            <div className='bg-foreground/5 flex items-center gap-1.5 rounded-2xl rounded-bl-md px-4 py-3'>
                {state === CHAT_TYPING_INDICATOR.THINKING ? (
                    <Fragment>
                        <BrainIcon
                            className='text-foreground/40 h-4 w-4 animate-pulse'
                            weight='duotone'
                        />
                        <span className='text-foreground/40 animate-pulse text-xs'>
                            {t('playground.chatThinking')}
                        </span>
                    </Fragment>
                ) : (
                    <Fragment>
                        <span className='bg-foreground/40 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:0ms]' />
                        <span className='bg-foreground/40 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:150ms]' />
                        <span className='bg-foreground/40 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:300ms]' />
                    </Fragment>
                )}
            </div>
        </div>
    )
}

export default ChatTypingIndicator