import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { ClawMascot } from '@/components/shared'

const ChatEmptyState: FC = (): ReactNode => {
    return (
        <div className='flex h-full flex-col items-center justify-center gap-3 px-14 pb-16'>
            <div className='bg-foreground/5 flex h-12 w-12 items-center justify-center rounded-xl'>
                <ClawMascot className='h-6 w-6' />
            </div>
            <div className='text-center'>
                <p className='text-foreground/80 text-sm font-medium'>
                    {t('chat.selectAgent')}
                </p>
                <p className='text-muted-foreground mt-1 text-xs'>
                    {t('chat.selectAgentDescription')}
                </p>
            </div>
        </div>
    )
}

export default ChatEmptyState