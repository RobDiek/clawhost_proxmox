import type { FC, ReactNode } from 'react'
import type { ChatSidebarProps } from '@/ts/Interfaces'

import { useCallback, useMemo, useState } from 'react'
import { t } from '@openclaw/i18n'
import { ClawMascot } from '@/components/shared'
import {
    ChatSidebarSearch,
    ChatSidebarSearchEmpty,
    ChatSidebarTreeView
} from '@/components/chat'

const ChatSidebar: FC<ChatSidebarProps> = ({
    claws,
    selectedClawId,
    readOnly,
    onOpenClawSettings,
    onClose
}): ReactNode => {
    const [search, setSearch] = useState('')

    const handleClawSettings = useCallback(
        (clawId: string) => {
            onOpenClawSettings(clawId)
            onClose?.()
        },
        [onOpenClawSettings, onClose]
    )

    const filteredClaws = useMemo(() => {
        if (!search.trim()) return claws
        const query = search.toLowerCase()
        return claws.filter(
            (claw) =>
                claw.name.toLowerCase().includes(query) ||
                claw.subdomain?.toLowerCase().includes(query)
        )
    }, [claws, search])

    if (claws.length === 0) {
        return (
            <div className='md:border-border flex h-full w-full shrink-0 flex-col items-center justify-center px-6 md:w-[280px] md:border-r'>
                <div className='bg-foreground/5 flex h-10 w-10 items-center justify-center rounded-xl'>
                    <ClawMascot className='h-5 w-5' />
                </div>
                <p className='text-muted-foreground mt-3 text-center text-xs'>
                    {t('clawDetail.noAgentsDescription')}
                </p>
            </div>
        )
    }

    return (
        <div className='bg-background md:border-border relative z-10 flex h-full w-full shrink-0 flex-col overflow-hidden md:w-[280px] md:border-r'>
            <ChatSidebarSearch
                value={search}
                onChange={setSearch}
                clawCount={claws.length}
            />
            <div className='flex-1 overflow-y-auto px-3 pb-3 pt-2'>
                {filteredClaws.length === 0 ? (
                    <ChatSidebarSearchEmpty />
                ) : (
                    <ChatSidebarTreeView
                        claws={filteredClaws}
                        selectedClawId={selectedClawId}
                        readOnly={readOnly}
                        onOpenClawSettings={handleClawSettings}
                    />
                )}
            </div>
        </div>
    )
}

export default ChatSidebar