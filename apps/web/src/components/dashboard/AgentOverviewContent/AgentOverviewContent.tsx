import type { FC, ReactNode } from 'react'
import type { AgentOverviewContentProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { agentType as agentTypeConst } from '@openclaw/shared'
import {
    GaugeIcon,
    ArrowsClockwiseIcon,
    BookOpenIcon,
    TerminalWindowIcon
} from '@phosphor-icons/react'
import { Button, Skeleton } from '@/components/ui'
import { PanelPlaceholder, LiveBadge } from '@/components/shared'
import { useAgentOverview } from '@/hooks'
import { agentTypes, demoOverview } from '@/data'
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
    agentType,
    readOnly,
    onSwitchToTerminal
}): ReactNode => {
    const { data: liveData, isPending, isError, error } = useAgentOverview(agentId, !readOnly)
    const data = readOnly ? demoOverview : liveData
    const isHermes = agentType === agentTypeConst.HERMES
    const docsUrl = agentTypes.find((option) => option.type === agentType)
        ?.docsUrl

    if (isError && isUnsupportedError(error))
        return (
            <div className='flex h-full items-center justify-center p-5'>
                <PanelPlaceholder
                    icon={
                        isHermes ? (
                            <TerminalWindowIcon
                                className='text-muted-foreground h-6 w-6'
                                weight='duotone'
                            />
                        ) : (
                            <ArrowsClockwiseIcon
                                className='text-muted-foreground h-6 w-6'
                                weight='duotone'
                            />
                        )
                    }
                    title={t(
                        isHermes
                            ? 'clawDetail.overviewHermesTitle'
                            : 'clawDetail.overviewUnsupportedTitle'
                    )}
                    description={t(
                        isHermes
                            ? 'clawDetail.overviewHermesDescription'
                            : 'clawDetail.overviewUnsupportedDescription'
                    )}
                    action={
                        isHermes ? (
                            <Fragment>
                                {onSwitchToTerminal && (
                                    <Button
                                        variant='outline'
                                        size='sm'
                                        onClick={onSwitchToTerminal}
                                    >
                                        <TerminalWindowIcon className='h-3.5 w-3.5' />
                                        {t(
                                            'clawDetail.overviewHermesOpenTerminal'
                                        )}
                                    </Button>
                                )}
                                {docsUrl && (
                                    <Button variant='outline' size='sm' asChild>
                                        <a
                                            href={docsUrl}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                        >
                                            <BookOpenIcon className='h-3.5 w-3.5' />
                                            {t('clawDetail.viewDocs')}
                                        </a>
                                    </Button>
                                )}
                            </Fragment>
                        ) : undefined
                    }
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