import type { FC, ReactNode } from 'react'
import type { ClawDetailSettingsTabProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { CircleNotchIcon } from '@phosphor-icons/react'

const ClawDetailSettingsTab: FC<ClawDetailSettingsTabProps> = ({
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
            </div>
        </div>
    )
}

export default ClawDetailSettingsTab