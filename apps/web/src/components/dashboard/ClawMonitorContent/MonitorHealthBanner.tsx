import type { FC, ReactNode } from 'react'
import type { MonitorHealthBannerProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    CheckCircleIcon,
    WarningIcon,
    WrenchIcon,
    CircleNotchIcon
} from '@phosphor-icons/react'
import { Button } from '@/components/ui'
import { useClawDiagnostics, useRepairClaw } from '@/hooks'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'

const MonitorHealthBanner: FC<MonitorHealthBannerProps> = ({ clawId }): ReactNode => {
    const diagnostics = useClawDiagnostics(clawId, true)
    const repair = useRepairClaw()
    const showToast = useUIStore((s) => s.showToast)

    const hasIssue =
        diagnostics.data &&
        (!diagnostics.data.service.includes('active (running)') ||
            diagnostics.data.port.includes('not listening'))

    const handleRepair = () => {
        repair.mutate(clawId, {
            onSuccess: () => {
                showToast(t('dashboard.diagnosticsRepairSuccess'), TOAST_TYPE.SUCCESS)
            },
            onError: (error) => {
                showToast(error.message || t('api.failedToRepairClaw'), TOAST_TYPE.ERROR)
            }
        })
    }

    if (!diagnostics.data) return null

    if (hasIssue) return (
        <div className='flex items-center justify-between rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400'>
            <div className='flex items-center gap-2'>
                <WarningIcon className='h-4 w-4 shrink-0' />
                {t('dashboard.diagnosticsIssueDetected')}
            </div>
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
    )

    return (
        <div className='flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400'>
            <CheckCircleIcon className='h-4 w-4 shrink-0' />
            {t('dashboard.diagnosticsHealthy')}
        </div>
    )
}

export default MonitorHealthBanner