import type { FC, ReactNode } from 'react'
import type { ChannelFieldInputProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { CopyIcon, EyeIcon, EyeSlashIcon } from '@phosphor-icons/react'
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui'

const ChannelFieldInput: FC<ChannelFieldInputProps> = ({
    def,
    field,
    config,
    visibleSecrets,
    toggleSecret,
    updateField,
    copyField
}): ReactNode => {
    const fieldId = `${def.key}-${String(field.key)}`
    const rawValue = config[field.key]
    const isWhatsApp = def.key === 'whatsapp'

    if (isWhatsApp) {
        const value = Array.isArray(rawValue)
            ? rawValue.join(', ')
            : (rawValue as string) || ''

        return (
            <div>
                <div className='mb-1.5 flex items-center justify-between'>
                    <label className='text-muted-foreground text-[11px] font-medium'>
                        {t(field.label)}
                    </label>
                </div>
                {field.type === 'select' && field.options ? (
                    <Select
                        value={value || field.options[0]?.value || ''}
                        onValueChange={(val) =>
                            updateField(def.key, String(field.key), val)
                        }
                    >
                        <SelectTrigger
                            placeholder={t(field.placeholder)}
                            className='border-border bg-foreground/5 h-8 text-[11px]'
                        />
                        <SelectContent>
                            {field.options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {t(opt.label)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <input
                        type='text'
                        value={value}
                        onChange={(e) =>
                            updateField(
                                def.key,
                                String(field.key),
                                e.target.value
                            )
                        }
                        placeholder={t(field.placeholder)}
                        className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-2.5 py-1.5 font-mono text-[11px] outline-none transition-colors focus:border-[#ef5350]/50'
                    />
                )}
            </div>
        )
    }

    const isVisible = visibleSecrets[fieldId]
    const value = (rawValue as string) || ''

    return (
        <div>
            <div className='mb-1.5 flex items-center justify-between'>
                <label className='text-muted-foreground text-[11px] font-medium'>
                    {t(field.label)}
                    {field.required && (
                        <span className='ml-0.5 text-red-600 dark:text-red-400'>
                            *
                        </span>
                    )}
                </label>
                <div className='flex items-center gap-1'>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type='button'
                                disabled={!value}
                                onClick={() => copyField(value)}
                                className='text-muted-foreground hover:text-foreground/80 disabled:hover:text-muted-foreground rounded p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30'
                            >
                                <CopyIcon className='h-3 w-3' />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('common.copy')}</TooltipContent>
                    </Tooltip>
                    {field.secret && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type='button'
                                    onClick={() => toggleSecret(fieldId)}
                                    className='text-muted-foreground hover:text-foreground/80 rounded p-0.5 transition-colors'
                                >
                                    {isVisible ? (
                                        <EyeSlashIcon className='h-3 w-3' />
                                    ) : (
                                        <EyeIcon className='h-3 w-3' />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <Fragment>
                                    {isVisible
                                        ? t('common.hide')
                                        : t('common.show')}
                                </Fragment>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </div>
            <input
                type={field.secret && !isVisible ? 'password' : 'text'}
                value={value}
                onChange={(e) =>
                    updateField(def.key, String(field.key), e.target.value)
                }
                placeholder={t(field.placeholder)}
                className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-2.5 py-1.5 font-mono text-[11px] outline-none transition-colors focus:border-[#ef5350]/50'
            />
        </div>
    )
}

export default ChannelFieldInput