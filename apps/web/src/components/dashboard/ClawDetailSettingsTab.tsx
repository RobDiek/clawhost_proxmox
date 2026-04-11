import type { FC, ReactNode } from 'react'
import type { ClawDetailSettingsTabProps } from '@/ts/Interfaces'

import { useState, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { CircleNotchIcon, DownloadSimpleIcon } from '@phosphor-icons/react'
import { api } from '@/lib'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'

const ClawDetailSettingsTab: FC<ClawDetailSettingsTabProps> = ({
    clawId,
    settingsName,
    settingsNameError,
    settingsSubdomain,
    settingsSubdomainError,
    settingsHasChanges,
    renamePending,
    subdomainPending,
    onNameChange,
    onSubdomainChange,
    onSave
}): ReactNode => {
    const { showToast } = useUIStore()
    const [isExporting, setIsExporting] = useState(false)

    const handleExport = useCallback(async () => {
        setIsExporting(true)
        try {
            await api.exportClaw(clawId, `${clawId}-export.tar.gz`)
            showToast(t('dashboard.exportSuccess'), TOAST_TYPE.SUCCESS)
        } catch {
            showToast(t('dashboard.exportFailed'), TOAST_TYPE.ERROR)
        }
        setIsExporting(false)
    }, [clawId, showToast])

    return (
        <div className='h-full overflow-y-auto p-5'>
            <div className='space-y-5'>
                <div>
                    <label className='text-muted-foreground mb-2 block text-xs font-medium'>
                        {t('clawDetail.settingsName')}
                    </label>
                    <input
                        type='text'
                        value={settingsName}
                        onChange={(e) => onNameChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (
                                e.key === 'Enter' &&
                                settingsHasChanges &&
                                !settingsNameError &&
                                !renamePending
                            ) {
                                onSave()
                            }
                        }}
                        placeholder={t('clawDetail.settingsNamePlaceholder')}
                        className={`bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:border-[#ef5350]/50 ${
                            settingsNameError
                                ? 'border-red-500/50'
                                : 'border-border'
                        }`}
                    />
                    {settingsNameError ? (
                        <p className='mt-1.5 text-[11px] text-red-600 dark:text-red-400'>
                            {settingsNameError}
                        </p>
                    ) : (
                        <p className='text-muted-foreground mt-1.5 text-[11px]'>
                            {t('clawDetail.settingsNameDescription')}
                        </p>
                    )}
                </div>

                <div>
                    <label className='text-muted-foreground mb-2 block text-xs font-medium'>
                        {t('clawDetail.subdomain')}
                    </label>
                    <div className='flex items-center gap-0'>
                        <input
                            type='text'
                            value={settingsSubdomain}
                            onChange={(e) =>
                                onSubdomainChange(e.target.value.toLowerCase())
                            }
                            onKeyDown={(e) => {
                                if (
                                    e.key === 'Enter' &&
                                    settingsHasChanges &&
                                    !settingsSubdomainError &&
                                    !subdomainPending
                                ) {
                                    onSave()
                                }
                            }}
                            placeholder={t('clawDetail.subdomainPlaceholder')}
                            className={`bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-l-md border border-r-0 px-3 py-2 text-sm outline-none transition-colors focus:border-[#ef5350]/50 ${
                                settingsSubdomainError
                                    ? 'border-red-500/50'
                                    : 'border-border'
                            }`}
                        />
                        <span className='border-border bg-foreground/5 text-muted-foreground flex items-center rounded-r-md border px-3 py-2 text-sm'>
                            .clawhost.cloud
                        </span>
                    </div>
                    {settingsSubdomainError ? (
                        <p className='mt-1.5 text-[11px] text-red-600 dark:text-red-400'>
                            {settingsSubdomainError}
                        </p>
                    ) : (
                        <p className='text-muted-foreground mt-1.5 text-[11px]'>
                            {t('clawDetail.subdomainDescription', {
                                min: inputValidation.SUBDOMAIN.MIN,
                                max: inputValidation.SUBDOMAIN.MAX
                            })}
                        </p>
                    )}
                </div>

                <button
                    onClick={onSave}
                    disabled={
                        !settingsHasChanges ||
                        !!settingsNameError ||
                        !!settingsSubdomainError ||
                        renamePending ||
                        subdomainPending
                    }
                    className='flex w-full items-center justify-center gap-2 rounded-lg bg-[#ef5350] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#e53935] disabled:cursor-not-allowed disabled:opacity-50'
                >
                    {(renamePending || subdomainPending) && (
                        <CircleNotchIcon className='h-4 w-4 animate-spin' />
                    )}
                    {t('clawDetail.settingsSave')}
                </button>

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
            </div>
        </div>
    )
}

export default ClawDetailSettingsTab