import type { FC, ReactNode } from 'react'
import type { ChatSidebarProps } from '@/ts/Interfaces'

import { useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { ClawMascot } from '@/components/shared'
import ChatSidebarTreeView from '@/components/chat/ChatSidebarTreeView'

const ChatSidebar: FC<ChatSidebarProps> = ({
    claws,
    selectedClawId,
    readOnly,
    onOpenClawSettings,
    onClose
}): ReactNode => {
    const handleClawSettings = useCallback(
        (clawId: string) => {
            onOpenClawSettings(clawId)
            onClose?.()
        },
        [onOpenClawSettings, onClose]
    )

    if (claws.length === 0) {
        return (
            <div className='md:border-border flex h-full w-full shrink-0 flex-col items-center justify-center px-6 md:w-[280px] md:border-r'>
                <div className='bg-foreground/5 flex h-10 w-10 items-center justify-center rounded-xl'>
                    <ClawMascot className='h-5 w-5' />
                </div>
                <p className='text-muted-foreground mt-3 text-center text-xs'>
                    {t('playground.noClawsDescription')}
                </p>
            </div>
        )
    }

    return (
        <div className='bg-background md:border-border relative z-10 flex h-full w-full shrink-0 flex-col md:w-[280px] md:border-r'>
            <div className='border-border hidden items-center justify-between border-b px-4 py-1 md:flex'>
                <span className='text-foreground text-sm font-medium'>
                    {t('nav.claws')}
                </span>
            </div>
            <div className='flex-1 overflow-y-auto p-3'>
                <ChatSidebarTreeView
                    claws={claws}
                    selectedClawId={selectedClawId}
                    readOnly={readOnly}
                    onOpenClawSettings={handleClawSettings}
                />
            </div>
        </div>
    )
}

export default ChatSidebar