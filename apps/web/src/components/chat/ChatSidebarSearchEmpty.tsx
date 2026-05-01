import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { GhostIcon } from '@phosphor-icons/react'

const ChatSidebarSearchEmpty: FC = (): ReactNode => {
    return (
        <div className='flex flex-col items-center justify-center pb-8 pt-16'>
            <GhostIcon className='text-muted-foreground h-6 w-6' />
            <p className='text-muted-foreground mt-2 max-w-[180px] text-center text-xs'>
                {t('dashboard.noAgentsMatchSearch')}
            </p>
        </div>
    )
}

export default ChatSidebarSearchEmpty