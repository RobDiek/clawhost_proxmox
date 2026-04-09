import type { FC, ReactNode } from 'react'
import type { EnvVarRowProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    TrashIcon,
    EyeIcon,
    EyeSlashIcon,
    CopyIcon,
    CheckIcon
} from '@phosphor-icons/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'

const EnvVarRow: FC<EnvVarRowProps> = ({
    envVar,
    index,
    keyError,
    valueError,
    showValue,
    isCopied,
    isPending,
    onChange,
    onToggleVisibility,
    onCopyValue,
    onRemove
}): ReactNode => {
    const idKey = `${index}-${envVar.key}`
    return (
        <div
            className={`bg-foreground/5 rounded-lg border p-3 ${
                keyError || valueError ? 'border-red-500/40' : 'border-border'
            }`}
        >
            <div className='mb-2 flex items-center justify-between'>
                <input
                    type='text'
                    value={envVar.key}
                    onChange={(e) => onChange(index, 'key', e.target.value)}
                    placeholder={t('playground.configurationKeyPlaceholder')}
                    className={`placeholder:text-muted-foreground bg-transparent font-mono text-xs font-medium outline-none ${
                        keyError
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-foreground/90'
                    }`}
                />
                <div className='flex items-center gap-1'>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type='button'
                                onClick={() => onToggleVisibility(idKey)}
                                className='text-muted-foreground hover:text-foreground/80 rounded p-1 transition-colors'
                            >
                                {showValue ? (
                                    <EyeSlashIcon className='h-3.5 w-3.5' />
                                ) : (
                                    <EyeIcon className='h-3.5 w-3.5' />
                                )}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {showValue ? t('common.hide') : t('common.show')}
                        </TooltipContent>
                    </Tooltip>
                    {envVar.value && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type='button'
                                    onClick={() =>
                                        onCopyValue(idKey, envVar.value)
                                    }
                                    className='text-muted-foreground hover:text-foreground/80 rounded p-1 transition-colors'
                                >
                                    {isCopied ? (
                                        <CheckIcon className='h-3.5 w-3.5 text-green-600 dark:text-green-400' />
                                    ) : (
                                        <CopyIcon className='h-3.5 w-3.5' />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>{t('common.copy')}</TooltipContent>
                        </Tooltip>
                    )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type='button'
                                onClick={() => onRemove(index)}
                                disabled={isPending}
                                className='text-muted-foreground rounded p-1 transition-colors disabled:cursor-default disabled:opacity-50 [&:not(:disabled)]:hover:text-red-600 dark:[&:not(:disabled)]:hover:text-red-400'
                            >
                                <TrashIcon className='h-3.5 w-3.5' />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {isPending
                                ? t('playground.variablesOperationPending')
                                : t('common.delete')}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>
            <input
                type={showValue ? 'text' : 'password'}
                value={envVar.value}
                onChange={(e) => onChange(index, 'value', e.target.value)}
                placeholder={t('playground.configurationValuePlaceholder')}
                className={`bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-2.5 py-1.5 font-mono text-xs outline-none transition-colors focus:border-[#ef5350]/50 ${
                    valueError ? 'border-red-500/40' : 'border-border'
                }`}
            />
            {(keyError || valueError) && (
                <p className='mt-1.5 text-[10px] text-red-600 dark:text-red-400'>
                    {keyError || valueError}
                </p>
            )}
        </div>
    )
}

export default EnvVarRow