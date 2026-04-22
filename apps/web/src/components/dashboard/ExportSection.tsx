import type { FC, ReactNode } from 'react'
import type { ExportSectionProps } from '@/ts/Interfaces'

import { useState, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { CircleNotchIcon, DownloadSimpleIcon } from '@phosphor-icons/react'
import { api } from '@/lib'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'

const ExportSection: FC<ExportSectionProps> = ({ agentId }): ReactNode => {
    const { showToast } = useUIStore()
    const [isExporting, setIsExporting] = useState(false)

    const handleExport = useCallback(async () => {
        setIsExporting(true)
        try {
            await api.exportAgent(agentId, `${agentId}-export.tar.gz`)
            showToast(t('dashboard.exportSuccess'), TOAST_TYPE.SUCCESS)
        } catch {
            showToast(t('dashboard.exportFailed'), TOAST_TYPE.ERROR)
        }
        setIsExporting(false)
    }, [agentId, showToast])

    return (
        <div className='border-border border-t pt-5'>
            <label className='text-muted-foreground mb-2 block text-xs font-medium'>
                {t('dashboard.exportAgent')}
            </label>
            <button
                onClick={handleExport}
                disabled={isExporting}
                className='border-border bg-foreground/5 hover:bg-foreground/10 text-foreground flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50'
            >
                {isExporting ? (
                    <CircleNotchIcon className='h-3.5 w-3.5 animate-spin' />
                ) : (
                    <DownloadSimpleIcon className='h-3.5 w-3.5' />
                )}
                {t('dashboard.exportAgentButton')}
            </button>
            <p className='text-muted-foreground mt-1.5 text-[11px]'>
                {t('dashboard.exportAgentTooltip')}
            </p>
        </div>
    )
}

export default ExportSection