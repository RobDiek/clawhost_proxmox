import type { FC, ReactNode } from 'react'
import type { OverviewGatewayCardProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    CheckCircleIcon,
    XCircleIcon,
    PlugIcon,
    WifiHighIcon,
    GlobeIcon,
    WrenchIcon,
    CircleNotchIcon
} from '@phosphor-icons/react'
import { Button } from '@/components/ui'
import { useRepairClaw } from '@/hooks'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'

const OverviewGatewayCard: FC<OverviewGatewayCardProps> = ({
    gateway,
    clawId
}): ReactNode => {
    const isHealthy = gateway.active && gateway.reachable
    const repair = useRepairClaw()
    const showToast = useUIStore((s) => s.showToast)

    const handleRepair = () => {
        repair.mutate(clawId, {
            onSuccess: () => {
                showToast(
                    t('dashboard.diagnosticsRepairSuccess'),
                    TOAST_TYPE.SUCCESS
                )
            },
            onError: (error) => {
                showToast(
                    error.message || t('api.failedToRepairClaw'),
                    TOAST_TYPE.ERROR
                )
            }
        })
    }

    return (
        <div className='border-border rounded-lg border p-4'>
            <div className='mb-3 flex items-center gap-2'>
                {isHealthy ? (
                    <CheckCircleIcon
                        className='h-4 w-4 text-green-500'
                        weight='fill'
                    />
                ) : (
                    <XCircleIcon
                        className='h-4 w-4 text-red-500'
                        weight='fill'
                    />
                )}
                <h4 className='text-sm font-medium'>
                    {t('clawDetail.overviewGatewayStatus')}
                </h4>
                <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${isHealthy ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}
                >
                    {isHealthy
                        ? t('clawDetail.overviewOnline')
                        : t('clawDetail.overviewOffline')}
                </span>
            </div>
            <div className='grid grid-cols-3 gap-2'>
                <div className='bg-foreground/5 rounded-lg px-3 py-2 text-center'>
                    <PlugIcon
                        className={`mx-auto h-4 w-4 ${gateway.active ? 'text-green-500' : 'text-red-500'}`}
                    />
                    <span className='text-muted-foreground mt-1 block text-[10px]'>
                        {t('clawDetail.overviewService')}
                    </span>
                    <span
                        className={`block text-xs font-medium ${gateway.active ? 'text-green-500' : 'text-red-500'}`}
                    >
                        {gateway.active
                            ? t('clawDetail.overviewServiceActive')
                            : t('clawDetail.overviewServiceInactive')}
                    </span>
                </div>
                <div className='bg-foreground/5 rounded-lg px-3 py-2 text-center'>
                    <WifiHighIcon
                        className={`mx-auto h-4 w-4 ${gateway.portListening ? 'text-green-500' : 'text-red-500'}`}
                    />
                    <span className='text-muted-foreground mt-1 block text-[10px]'>
                        {t('clawDetail.overviewPort')}
                    </span>
                    <span
                        className={`block text-xs font-medium ${gateway.portListening ? 'text-green-500' : 'text-red-500'}`}
                    >
                        {gateway.portListening
                            ? t('clawDetail.overviewPortOpen')
                            : t('clawDetail.overviewPortClosed')}
                    </span>
                </div>
                <div className='bg-foreground/5 rounded-lg px-3 py-2 text-center'>
                    <GlobeIcon
                        className={`mx-auto h-4 w-4 ${gateway.reachable ? 'text-green-500' : 'text-red-500'}`}
                    />
                    <span className='text-muted-foreground mt-1 block text-[10px]'>
                        API
                    </span>
                    <span
                        className={`block text-xs font-medium ${gateway.reachable ? 'text-green-500' : 'text-red-500'}`}
                    >
                        {gateway.reachable
                            ? t('clawDetail.overviewOnline')
                            : t('clawDetail.overviewOffline')}
                    </span>
                </div>
            </div>
            {!isHealthy && (
                <div className='mt-3 flex items-center justify-between rounded-md bg-yellow-500/10 p-3'>
                    <span className='text-sm text-yellow-700 dark:text-yellow-400'>
                        {t('dashboard.diagnosticsIssueDetected')}
                    </span>
                    <Button
                        size='sm'
                        variant='outline'
                        className='shrink-0 border-yellow-500/30 text-yellow-700 hover:bg-yellow-500/20 hover:text-yellow-800 dark:text-yellow-400 dark:hover:bg-yellow-500/20 dark:hover:text-yellow-300'
                        onClick={handleRepair}
                        disabled={repair.isPending}
                    >
                        {repair.isPending ? (
                            <CircleNotchIcon className='mr-1 h-3.5 w-3.5 animate-spin' />
                        ) : (
                            <WrenchIcon className='mr-1 h-3.5 w-3.5' />
                        )}
                        {t('dashboard.diagnosticsRepair')}
                    </Button>
                </div>
            )}
        </div>
    )
}

export default OverviewGatewayCard