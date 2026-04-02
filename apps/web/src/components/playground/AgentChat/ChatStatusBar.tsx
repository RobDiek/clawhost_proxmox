import type { FC, ReactNode } from 'react'
import type { ChatStatusBarProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { GATEWAY_CONNECTION_STATE } from '@/lib/constants'

const ChatStatusBar: FC<ChatStatusBarProps> = ({
    connectionState
}): ReactNode => {
    if (connectionState === GATEWAY_CONNECTION_STATE.CONNECTED) return null

    const isConnecting =
        connectionState === GATEWAY_CONNECTION_STATE.CONNECTING ||
        connectionState === GATEWAY_CONNECTION_STATE.AUTHENTICATING
    const isError = connectionState === GATEWAY_CONNECTION_STATE.ERROR

    return (
        <div className='border-border flex items-center gap-2 border-b px-4 py-2'>
            <div
                className={`h-2 w-2 rounded-full ${
                    isConnecting
                        ? 'animate-pulse bg-yellow-500'
                        : isError
                          ? 'bg-red-500'
                          : 'bg-gray-500'
                }`}
            />
            <span className='text-muted-foreground text-xs'>
                {isConnecting &&
                connectionState === GATEWAY_CONNECTION_STATE.CONNECTING
                    ? t('playground.chatConnecting')
                    : isConnecting
                      ? t('playground.chatAuthenticating')
                      : isError
                        ? t('playground.chatError')
                        : t('playground.chatDisconnected')}
            </span>
        </div>
    )
}

export default ChatStatusBar