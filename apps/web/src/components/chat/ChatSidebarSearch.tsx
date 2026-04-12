import type { FC, ReactNode } from 'react'
import type { ChatSidebarSearchProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'

const ChatSidebarSearch: FC<ChatSidebarSearchProps> = ({
    value,
    onChange,
    clawCount
}): ReactNode => {
    const placeholder =
        clawCount > 0
            ? t('dashboard.searchAgentsCount', { count: clawCount })
            : t('dashboard.searchAgents')

    return (
        <div className='min-w-0 flex-1'>
            <div className='relative'>
                <MagnifyingGlassIcon className='text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2' />
                <input
                    type='text'
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border py-2 pl-8 pr-8 text-xs outline-none transition-colors focus:border-[#ef5350]/50'
                />
                {value && (
                    <button
                        onClick={() => onChange('')}
                        className='text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors'
                    >
                        <XIcon className='h-3.5 w-3.5' />
                    </button>
                )}
            </div>
        </div>
    )
}

export default ChatSidebarSearch