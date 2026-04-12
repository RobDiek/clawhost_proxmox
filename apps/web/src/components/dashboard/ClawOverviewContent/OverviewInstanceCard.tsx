import type { FC, ReactNode } from 'react'
import type { OverviewInstanceCardProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    CpuIcon,
    TagIcon,
    BrainIcon,
    UsersIcon,
    ClockCountdownIcon,
    DatabaseIcon
} from '@phosphor-icons/react'

const OverviewInstanceCard: FC<OverviewInstanceCardProps> = ({
    instance
}): ReactNode => {
    const hasData =
        instance.version || instance.model || instance.agents || instance.memory

    if (!hasData) return null

    return (
        <div className='border-border rounded-lg border p-4'>
            <div className='mb-3 flex items-center gap-2'>
                <CpuIcon className='h-4 w-4 text-blue-500' />
                <h4 className='text-sm font-medium'>
                    {t('clawDetail.overviewInstanceStatus')}
                </h4>
            </div>
            <div className='grid grid-cols-2 gap-2'>
                {instance.version && (
                    <div className='bg-foreground/5 rounded-lg px-3 py-2'>
                        <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                            <TagIcon className='h-3 w-3' />
                            {t('clawDetail.overviewVersion')}
                        </span>
                        <span className='mt-0.5 block font-mono text-sm'>
                            {instance.version}
                        </span>
                    </div>
                )}
                {instance.model && (
                    <div className='bg-foreground/5 rounded-lg px-3 py-2'>
                        <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                            <BrainIcon className='h-3 w-3' />
                            {t('clawDetail.overviewModel')}
                        </span>
                        <span className='mt-0.5 block truncate font-mono text-sm'>
                            {instance.model}
                            {instance.contextWindow && (
                                <span className='text-muted-foreground ml-1 text-xs'>
                                    ({instance.contextWindow} ctx)
                                </span>
                            )}
                        </span>
                    </div>
                )}
                {instance.agents && (
                    <div className='bg-foreground/5 rounded-lg px-3 py-2'>
                        <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                            <UsersIcon className='h-3 w-3' />
                            {t('clawDetail.overviewAgents')}
                        </span>
                        <span className='mt-0.5 block text-sm'>
                            {instance.agents}
                        </span>
                    </div>
                )}
                <div className='bg-foreground/5 rounded-lg px-3 py-2'>
                    <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                        {t('clawDetail.overviewSessions')}
                    </span>
                    <span className='mt-0.5 block font-mono text-sm'>
                        {instance.activeSessions}
                    </span>
                </div>
                {instance.memory && (
                    <div className='bg-foreground/5 rounded-lg px-3 py-2'>
                        <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                            <DatabaseIcon className='h-3 w-3' />
                            {t('clawDetail.overviewMemoryStatus')}
                        </span>
                        <span className='mt-0.5 block text-sm'>
                            {instance.memory}
                        </span>
                    </div>
                )}
                {instance.heartbeat && (
                    <div className='bg-foreground/5 rounded-lg px-3 py-2'>
                        <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                            <ClockCountdownIcon className='h-3 w-3' />
                            {t('clawDetail.overviewHeartbeat')}
                        </span>
                        <span className='mt-0.5 block text-sm'>
                            {instance.heartbeat}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

export default OverviewInstanceCard