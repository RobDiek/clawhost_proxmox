import type { FC, ReactNode } from 'react'
import type { ClawDetailSettingsTabProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { CircleNotchIcon, ExportIcon } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth'

const ClawDetailSettingsTab: FC<ClawDetailSettingsTabProps> = ({
    settingsName,
    settingsNameError,
    settingsSubdomain,
    settingsSubdomainError,
    settingsHasChanges,
    renamePending,
    subdomainPending,
    isExporting,
    onNameChange,
    onSubdomainChange,
    onSave,
    onExport
}): ReactNode => {
    const { isLocal } = useAuth()

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

                {isLocal && (
                    <div>
                        <label className='text-muted-foreground mb-2 block text-xs font-medium'>
                            {t('clawDetail.subdomain')}
                        </label>
                        <div className='flex items-center gap-0'>
                            <input
                                type='text'
                                value={settingsSubdomain}
                                onChange={(e) =>
                                    onSubdomainChange(
                                        e.target.value.toLowerCase()
                                    )
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
                                placeholder={t(
                                    'clawDetail.subdomainPlaceholder'
                                )}
                                className={`bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-l-md border border-r-0 px-3 py-2 text-sm outline-none transition-colors focus:border-[#ef5350]/50 ${
                                    settingsSubdomainError
                                        ? 'border-red-500/50'
                                        : 'border-border'
                                }`}
                            />
                            <span className='border-border bg-foreground/5 text-muted-foreground flex items-center rounded-r-md border px-3 py-2 text-sm'>
                                .clawhost
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
                )}

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
                    <button
                        onClick={onExport}
                        disabled={isExporting}
                        className='text-muted-foreground hover:text-foreground hover:bg-foreground/5 flex w-full items-center gap-2 rounded-lg border border-transparent px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50'
                    >
                        {isExporting ? (
                            <CircleNotchIcon className='h-4 w-4 animate-spin' />
                        ) : (
                            <ExportIcon className='h-4 w-4' />
                        )}
                        {t('dashboard.exportData')}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ClawDetailSettingsTab