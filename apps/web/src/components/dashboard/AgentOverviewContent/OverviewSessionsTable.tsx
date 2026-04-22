import type { FC, ReactNode } from 'react'
import type { OverviewSessionsTableProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { ChatsCircleIcon } from '@phosphor-icons/react'
import { getLocale } from '@/lib'

const OverviewSessionsTable: FC<OverviewSessionsTableProps> = ({
    sessions
}): ReactNode => {
    if (!sessions || sessions.length === 0) {
        return (
            <div className='border-border rounded-lg border p-4'>
                <div className='mb-3 flex items-center gap-2'>
                    <ChatsCircleIcon className='h-4 w-4 text-blue-500' />
                    <h4 className='text-sm font-medium'>
                        {t('clawDetail.overviewSessions')}
                    </h4>
                </div>
                <p className='text-muted-foreground text-sm'>
                    {t('clawDetail.overviewNoSessions')}
                </p>
            </div>
        )
    }

    return (
        <div className='border-border rounded-lg border p-4'>
            <div className='mb-3 flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                    <ChatsCircleIcon className='h-4 w-4 text-blue-500' />
                    <h4 className='text-sm font-medium'>
                        {t('clawDetail.overviewSessions')}
                    </h4>
                </div>
                <span className='text-muted-foreground text-xs'>
                    {t('clawDetail.overviewSessionsCount', {
                        count: String(sessions.length)
                    })}
                </span>
            </div>
            <div className='space-y-2'>
                {sessions.map((session) => (
                    <Fragment key={session.key}>
                        <div className='bg-foreground/5 rounded-lg px-3 py-2'>
                            <div className='flex items-center justify-between'>
                                <span className='text-sm font-medium'>
                                    {session.name || session.key}
                                </span>
                                {session.model && (
                                    <span className='bg-foreground/10 rounded px-1.5 py-0.5 font-mono text-xs'>
                                        {session.model}
                                    </span>
                                )}
                            </div>
                            <div className='text-muted-foreground mt-1 flex items-center gap-3 text-xs'>
                                <span>
                                    {t('clawDetail.overviewSessionMessages')}:{' '}
                                    {session.messageCount ?? 0}
                                </span>
                                {session.updated && (
                                    <span>
                                        {new Date(
                                            session.updated
                                        ).toLocaleString(getLocale())}
                                    </span>
                                )}
                            </div>
                        </div>
                    </Fragment>
                ))}
            </div>
        </div>
    )
}

export default OverviewSessionsTable