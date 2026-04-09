import type { FC, ReactNode } from 'react'
import type { SecretInputFieldProps } from '@/ts/Interfaces'

import { Fragment, useState, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import {
    CheckCircleIcon,
    CheckIcon,
    CopyIcon,
    EyeIcon,
    EyeSlashIcon
} from '@phosphor-icons/react'
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui/tooltip'
import { copyToClipboard } from '@/lib'

const SecretInputField: FC<SecretInputFieldProps> = ({
    label,
    value,
    onChange,
    placeholder,
    existingValue,
    configuredLabel,
    helperText
}): ReactNode => {
    const [showSecret, setShowSecret] = useState(false)
    const [copied, setCopied] = useState(false)

    const handleCopy = useCallback(async () => {
        if (existingValue) {
            await copyToClipboard(existingValue)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }, [existingValue])

    return (
        <div>
            <div className='mb-2 flex items-center justify-between'>
                <label className='text-muted-foreground text-xs font-medium'>
                    {label}
                </label>
                <div className='flex items-center'>
                    {existingValue && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type='button'
                                    onClick={handleCopy}
                                    className='text-muted-foreground hover:text-foreground/80 rounded p-1 transition-colors'
                                >
                                    {copied ? (
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
                                onClick={() => setShowSecret(!showSecret)}
                                className='text-muted-foreground hover:text-foreground/80 rounded p-1 transition-colors'
                            >
                                {showSecret ? (
                                    <EyeSlashIcon className='h-3.5 w-3.5' />
                                ) : (
                                    <EyeIcon className='h-3.5 w-3.5' />
                                )}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {showSecret ? t('common.hide') : t('common.show')}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>
            {existingValue ? (
                <Fragment>
                    <input
                        type={showSecret ? 'text' : 'password'}
                        value={existingValue}
                        readOnly
                        className='border-border bg-foreground/5 text-muted-foreground w-full rounded-md border px-3 py-2 font-mono text-[11px] outline-none'
                    />
                    {configuredLabel && (
                        <p className='mt-1.5 flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400'>
                            <CheckCircleIcon
                                className='h-3 w-3'
                                weight='fill'
                            />
                            {configuredLabel}
                        </p>
                    )}
                </Fragment>
            ) : (
                <Fragment>
                    <input
                        type={showSecret ? 'text' : 'password'}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 font-mono text-[11px] outline-none transition-colors focus:border-[#ef5350]/50'
                    />
                    {helperText && (
                        <p className='text-muted-foreground mt-1.5 font-mono text-[11px]'>
                            {helperText}
                        </p>
                    )}
                </Fragment>
            )}
        </div>
    )
}

export default SecretInputField