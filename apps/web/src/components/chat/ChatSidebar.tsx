import type { FC, ReactNode } from 'react'
import type { ChatSidebarProps } from '@/ts/Interfaces'

import { useCallback, useMemo, useState } from 'react'
import { t } from '@openclaw/i18n'
import { SidebarSimpleIcon } from '@phosphor-icons/react'
import { ClawMascot, ClawAvatar } from '@/components/shared'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { usePreferencesStore } from '@/lib/store'
import { CLAW_AVATAR_SIZE } from '@/lib/constants'
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
    const collapsed = usePreferencesStore((s) => s.sidebarCollapsed)
    const setSidebarCollapsed = usePreferencesStore(
        (s) => s.setSidebarCollapsed
    )

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
            <div className='md:border-border flex h-full w-full shrink-0 flex-col items-center justify-center px-6 md:w-[250px] md:border-r'>
                <div className='bg-foreground/5 flex h-10 w-10 items-center justify-center rounded-xl'>
                    <ClawMascot className='h-5 w-5' />
                </div>
                <p className='text-muted-foreground mt-3 text-center text-xs'>
                    {t('clawDetail.noAgentsDescription')}
                </p>
            </div>
        )
    }

    if (collapsed) {
        return (
            <div className='bg-background md:border-border relative z-10 hidden h-full w-12 shrink-0 flex-col items-center md:flex md:border-r'>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => setSidebarCollapsed(false)}
                            className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground mt-2.5 rounded-lg p-1.5 transition-colors'
                        >
                            <SidebarSimpleIcon className='h-4 w-4' />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side='right'>
                        {t('clawDetail.expandSidebar')}
                    </TooltipContent>
                </Tooltip>
                <div className='scrollbar-hide mt-2 flex flex-1 flex-col items-center gap-0.5 overflow-y-auto'>
                    {claws.map((claw) => {
                        const isSelected = selectedClawId === claw.id
                        return (
                            <Tooltip key={claw.id}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() =>
                                            handleClawSettings(claw.id)
                                        }
                                        className={`shrink-0 border-l-2 px-1.5 py-0.5 transition-colors ${
                                            isSelected
                                                ? 'border-[#ef5350]'
                                                : 'border-transparent hover:bg-foreground/5'
                                        }`}
                                    >
                                        <ClawAvatar
                                            emoji={claw.emoji}
                                            emojiColor={claw.emojiColor}
                                            size={CLAW_AVATAR_SIZE.SM}
                                        />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side='right'>
                                    {claw.name}
                                </TooltipContent>
                            </Tooltip>
                        )
                    })}
                </div>
            </div>
        )
    }

    return (
        <div className='bg-background md:border-border relative z-10 flex h-full w-full shrink-0 flex-col overflow-hidden md:w-[250px] md:border-r'>
            <div className='flex items-center gap-1.5 px-3 pb-2 pt-3'>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => setSidebarCollapsed(true)}
                            className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground hidden shrink-0 rounded-lg p-1.5 transition-colors md:block'
                        >
                            <SidebarSimpleIcon className='h-4 w-4' />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side='right'>
                        {t('clawDetail.collapseSidebar')}
                    </TooltipContent>
                </Tooltip>
                <ChatSidebarSearch
                    value={search}
                    onChange={setSearch}
                    clawCount={claws.length}
                />
            </div>
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