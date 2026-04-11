import type { FC, ReactNode } from 'react'
import type { ChatSidebarSearchProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'

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
        <div className='px-3 pb-2 pt-3'>
            <div className='relative'>
                <MagnifyingGlassIcon className='text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2' />
                <input
                    type='text'
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className='bg-foreground/5 text-foreground placeholder:text-muted-foreground h-8 w-full rounded-lg pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-white/20'
                />
            </div>
        </div>
    )
}

export default ChatSidebarSearch