import type { FC, ReactNode } from 'react'
import type { AgentOverviewContentProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { GaugeIcon, ArrowsClockwiseIcon } from '@phosphor-icons/react'
import { Skeleton } from '@/components/ui'
import { PanelPlaceholder, LiveBadge } from '@/components/shared'
import { useAgentOverview } from '@/hooks'
import { demoOverview } from '@/data'
import {
    OverviewGatewayCard,
    OverviewInstanceCard,
    OverviewConfigCard,
    OverviewSessionsTable
} from '@/components/dashboard/AgentOverviewContent'

const isUnsupportedError = (error: Error | null): boolean => {
    if (!error || !('code' in error)) return false
    return (error as Error & { code: number }).code === 422
}

const AgentOverviewContent: FC<AgentOverviewContentProps> = ({
    agentId,
    readOnly
}): ReactNode => {
    const { data: liveData, isPending, isError, error } = useAgentOverview(agentId, !readOnly)
    const data = readOnly ? demoOverview : liveData

    if (isError && isUnsupportedError(error))
        return (
            <div className='flex h-full items-center justify-center p-5'>
                <PanelPlaceholder
                    icon={
                        <ArrowsClockwiseIcon
                            className='text-muted-foreground h-6 w-6'
                            weight='duotone'
                        />
                    }
                    title={t('clawDetail.overviewUnsupportedTitle')}
                    description={t('clawDetail.overviewUnsupportedDescription')}
                />
            </div>
        )

    if (isError)
        return (
            <div className='flex h-full items-center justify-center p-5'>
                <PanelPlaceholder
                    icon={
                        <GaugeIcon
                            className='text-muted-foreground h-6 w-6'
                            weight='duotone'
                        />
                    }
                    title={t('clawDetail.overviewError')}
                    description={t('clawDetail.overviewErrorDescription')}
                />
            </div>
        )

    if (isPending && !data)
        return (
            <div className='space-y-4 p-5'>
                <Skeleton className='h-8 w-48 rounded-md' />
                <Skeleton className='h-[100px] w-full rounded-lg' />
                <Skeleton className='h-[160px] w-full rounded-lg' />
                <Skeleton className='h-[120px] w-full rounded-lg' />
                <Skeleton className='h-[100px] w-full rounded-lg' />
            </div>
        )

    if (!data) return null

    return (
        <div className='h-full space-y-4 overflow-y-auto p-5'>
            <div className='flex items-center gap-2'>
                <h3 className='text-sm font-medium'>
                    {t('clawDetail.overviewTitle')}
                </h3>
                <LiveBadge />
            </div>

            <OverviewGatewayCard gateway={data.gateway} agentId={agentId} />

            <OverviewInstanceCard instance={data.instance} />

            <OverviewConfigCard config={data.config} />

            <OverviewSessionsTable sessions={data.sessions} />
        </div>
    )
}

export default AgentOverviewContent