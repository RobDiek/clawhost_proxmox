import type { FC, ReactNode } from 'react'
import type { ClawDiagnosticsContentProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Button, Skeleton } from '@/components/ui'
import {
    CircleNotchIcon,
    WrenchIcon,
    CheckCircleIcon,
    WarningIcon,
    PulseIcon
} from '@phosphor-icons/react'
import { useClawDiagnostics, useRepairClaw } from '@/hooks'
import { PanelPlaceholder } from '@/components/shared'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'

const ClawDiagnosticsContent: FC<ClawDiagnosticsContentProps> = ({
    clawId,
    enabled,
    mockData
}): ReactNode => {
    const query = useClawDiagnostics(clawId, enabled && !mockData)
    const diagnostics = mockData
        ? { data: mockData, isPending: false, isError: false }
        : query
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
            onError: (err) => {
                showToast(
                    err.message || t('api.failedToRepairClaw'),
                    TOAST_TYPE.ERROR
                )
            }
        })
    }

    const hasIssue =
        diagnostics.data &&
        (!diagnostics.data.service.includes('active (running)') ||
            diagnostics.data.port.includes('not listening'))

    return (
        <div className='h-full overflow-y-auto'>
            {diagnostics.isError && (
                <PanelPlaceholder
                    icon={
                        <PulseIcon
                            className='text-muted-foreground h-6 w-6'
                            weight='duotone'
                        />
                    }
                    title={t('api.failedToGetDiagnostics')}
                    description={t('api.failedToGetDiagnosticsDescription')}
                />
            )}
            {(diagnostics.isPending || diagnostics.data) && (
                <div className='space-y-5'>
                    {diagnostics.isPending && (
                        <Skeleton className='h-[42px] w-full rounded-md' />
                    )}
                    {diagnostics.data && hasIssue && (
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
                    )}
                    {diagnostics.data && !hasIssue && (
                        <div className='flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400'>
                            <CheckCircleIcon className='h-4 w-4 shrink-0' />
                            {t('dashboard.diagnosticsHealthy')}
                        </div>
                    )}
                    <div>
                        <p className='text-muted-foreground mb-1 text-sm font-medium'>
                            {t('dashboard.diagnosticsStatus')}
                        </p>
                        {diagnostics.isPending ? (
                            <Skeleton className='border-border h-[250px] w-full rounded-md border' />
                        ) : (
                            <pre className='border-border bg-muted text-foreground/80 h-[250px] overflow-auto rounded-md border p-3 text-xs leading-snug'>
                                {diagnostics.data?.service}
                            </pre>
                        )}
                    </div>
                    <div>
                        <p className='text-muted-foreground mb-1 text-sm font-medium'>
                            {t('dashboard.diagnosticsPort')}
                        </p>
                        {diagnostics.isPending ? (
                            <Skeleton className='border-border h-[70px] w-full rounded-md border' />
                        ) : (
                            <pre className='border-border bg-muted text-foreground/80 h-[70px] overflow-auto rounded-md border p-3 text-xs leading-snug'>
                                {diagnostics.data?.port}
                            </pre>
                        )}
                    </div>
                    <div>
                        <p className='text-muted-foreground mb-1 text-sm font-medium'>
                            {t('dashboard.diagnosticsMemory')}
                        </p>
                        {diagnostics.isPending ? (
                            <Skeleton className='border-border h-[80px] w-full rounded-md border' />
                        ) : (
                            <pre className='border-border bg-muted text-foreground/80 h-[80px] overflow-auto rounded-md border p-3 text-xs leading-snug'>
                                {diagnostics.data?.memory}
                            </pre>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default ClawDiagnosticsContent