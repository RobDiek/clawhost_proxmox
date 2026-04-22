import type { FC, ReactNode } from 'react'
import type { AgentVolumesContentProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    DatabaseIcon,
    CheckCircleIcon,
    CircleNotchIcon,
    WarningIcon,
    InfoIcon
} from '@phosphor-icons/react'
import { PanelPlaceholder } from '@/components/shared'

const formatSize = (sizeInGb: number): string => {
    if (sizeInGb >= 1000) return `${(sizeInGb / 1000).toFixed(1)} TB`
    return `${sizeInGb} GB`
}

const statusConfig: Record<string, { icon: ReactNode; className: string }> = {
    available: {
        icon: <CheckCircleIcon className='h-3.5 w-3.5' />,
        className: 'text-green-600 bg-green-500/10 dark:text-green-400'
    },
    creating: {
        icon: <CircleNotchIcon className='h-3.5 w-3.5 animate-spin' />,
        className: 'text-blue-600 bg-blue-500/10 dark:text-blue-400'
    },
    attached: {
        icon: <CheckCircleIcon className='h-3.5 w-3.5' />,
        className: 'text-green-600 bg-green-500/10 dark:text-green-400'
    }
}

const defaultStatus = {
    icon: <WarningIcon className='h-3.5 w-3.5' />,
    className: 'text-muted-foreground bg-muted'
}

const hasVolumes = (volumes: AgentVolumesContentProps['volumes']) =>
    volumes && volumes.length > 0

const AgentVolumesContent: FC<AgentVolumesContentProps> = ({
    volumes,
    readOnly
}): ReactNode => {
    return (
        <div className='flex h-full flex-col overflow-y-auto p-5'>
            {!readOnly && (
                <div className='text-muted-foreground mb-4 flex items-start gap-2 rounded-lg bg-blue-500/5 p-3 text-xs'>
                    <InfoIcon className='mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500' />
                    <p>
                        {t('clawDetail.volumesReadOnly')}{' '}
                        <a
                            href={`mailto:${t('common.supportEmail')}`}
                            className='text-blue-500 underline decoration-transparent transition-colors hover:decoration-blue-500'
                        >
                            {t('clawDetail.volumesContactSupport')}
                        </a>
                        .
                    </p>
                </div>
            )}

            {hasVolumes(volumes) ? (
                <div className='space-y-3'>
                    <div className='flex items-center justify-between'>
                        <h3 className='text-sm font-medium'>
                            {t('clawDetail.volumesTitle')}
                        </h3>
                        <span className='text-muted-foreground text-xs'>
                            {t('clawDetail.volumesCount', {
                                count: String(volumes.length)
                            })}
                        </span>
                    </div>

                    <div className='space-y-2'>
                        {volumes.map((volume) => {
                            const config =
                                statusConfig[volume.status] || defaultStatus
                            return (
                                <div
                                    key={volume.id}
                                    className='border-border rounded-lg border p-4'
                                >
                                    <div className='flex items-start justify-between'>
                                        <div className='flex items-center gap-3'>
                                            <div className='bg-foreground/5 flex h-9 w-9 items-center justify-center rounded-lg'>
                                                <DatabaseIcon className='text-muted-foreground h-4.5 w-4.5' />
                                            </div>
                                            <div>
                                                <p className='text-foreground text-sm font-medium'>
                                                    {volume.name}
                                                </p>
                                                <p className='text-muted-foreground text-xs'>
                                                    {formatSize(volume.size)}
                                                </p>
                                            </div>
                                        </div>
                                        <div
                                            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${config.className}`}
                                        >
                                            {config.icon}
                                            {volume.status}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <div className='flex flex-1 items-center justify-center'>
                    <PanelPlaceholder
                        icon={
                            <DatabaseIcon
                                className='text-muted-foreground h-6 w-6'
                                weight='duotone'
                            />
                        }
                        title={t('clawDetail.volumesEmpty')}
                        description={t('clawDetail.volumesEmptyDescription')}
                    />
                </div>
            )}
        </div>
    )
}

export default AgentVolumesContent