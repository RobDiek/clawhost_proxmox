import type { FC, ReactNode } from 'react'
import type { ClawTerminalContentProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    CircleNotchIcon,
    TerminalWindowIcon,
    ArrowClockwiseIcon
} from '@phosphor-icons/react'
import { Button } from '@/components/ui'
import { ScrollToBottomButton, PanelPlaceholder } from '@/components/shared'
import { TERMINAL_STATUS } from '@/lib/constants'
import { useTerminalConnection } from '@/hooks'
import '@xterm/xterm/css/xterm.css'

const ClawTerminalContent: FC<ClawTerminalContentProps> = ({
    clawId,
    enabled
}): ReactNode => {
    const {
        containerRef,
        status,
        showScrollButton,
        showOverlay,
        connect,
        handleTerminalScrollToBottom
    } = useTerminalConnection(clawId, enabled)

    return (
        <div
            className='bg-muted/50 relative h-full w-full overflow-hidden'
            onKeyDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                    e.preventDefault()
                }
            }}
        >
            <div
                ref={containerRef}
                className={`absolute bottom-2 left-2 right-0 top-2 overflow-hidden ${showOverlay ? 'opacity-0' : ''}`}
            />
            {showOverlay && (
                <div className='bg-muted/50 absolute inset-0 flex items-center justify-center'>
                    {status === TERMINAL_STATUS.CONNECTING && (
                        <div className='flex flex-col items-center gap-3'>
                            <CircleNotchIcon className='text-muted-foreground h-6 w-6 animate-spin' />
                            <span className='text-muted-foreground text-xs'>
                                {t('clawDetail.terminalConnecting')}
                            </span>
                        </div>
                    )}
                    {(status === TERMINAL_STATUS.ERROR ||
                        status === TERMINAL_STATUS.DISCONNECTED) && (
                        <PanelPlaceholder
                            icon={
                                <TerminalWindowIcon
                                    className='text-muted-foreground h-6 w-6'
                                    weight='duotone'
                                />
                            }
                            title={t(
                                status === TERMINAL_STATUS.ERROR
                                    ? 'clawDetail.terminalError'
                                    : 'clawDetail.terminalDisconnected'
                            )}
                            description=''
                            action={
                                <Button
                                    size='sm'
                                    variant='outline'
                                    onClick={connect}
                                >
                                    <ArrowClockwiseIcon className='mr-2 h-3.5 w-3.5' />
                                    {t('clawDetail.terminalReconnect')}
                                </Button>
                            }
                        />
                    )}
                </div>
            )}
            <ScrollToBottomButton
                visible={showScrollButton && !showOverlay}
                onClick={handleTerminalScrollToBottom}
            />
        </div>
    )
}

export default ClawTerminalContent