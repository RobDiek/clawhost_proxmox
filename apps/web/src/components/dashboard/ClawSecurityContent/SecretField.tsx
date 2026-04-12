import type { FC, ReactNode } from 'react'
import type { SecretFieldProps } from '@/ts/Interfaces'

import { useState } from 'react'
import { t } from '@openclaw/i18n'
import {
    ArrowClockwiseIcon,
    CircleNotchIcon,
    EyeIcon,
    EyeSlashIcon,
    CopyIcon,
    FloppyDiskIcon
} from '@phosphor-icons/react'
import {
    Button,
    Input,
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from '@/components/ui'
import { copyToClipboard } from '@/lib'
import { useToast } from '@/hooks'

const SecretField: FC<SecretFieldProps> = ({
    value,
    onChange,
    onRandomize,
    onSave,
    placeholder,
    saveTooltip,
    hasChanges,
    saving
}): ReactNode => {
    const [revealed, setRevealed] = useState(false)
    const toast = useToast()

    return (
        <div className='flex items-center gap-2'>
            <div className='relative flex-1'>
                <Input
                    type={revealed ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className='bg-muted pr-10 font-mono text-sm'
                />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type='button'
                            onClick={() => setRevealed((p) => !p)}
                            className='text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2'
                        >
                            {revealed ? (
                                <EyeSlashIcon className='h-4 w-4' />
                            ) : (
                                <EyeIcon className='h-4 w-4' />
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {revealed ? t('common.hide') : t('common.show')}
                    </TooltipContent>
                </Tooltip>
            </div>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        onClick={async () => {
                            await copyToClipboard(value)
                            toast.success(t('common.copied'))
                        }}
                    >
                        <CopyIcon className='h-4 w-4' />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{t('common.copy')}</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        onClick={onRandomize}
                    >
                        <ArrowClockwiseIcon className='h-4 w-4' />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    {t('clawDetail.securityRandomize')}
                </TooltipContent>
            </Tooltip>
            {hasChanges && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            onClick={onSave}
                            disabled={saving}
                        >
                            {saving ? (
                                <CircleNotchIcon className='h-4 w-4 animate-spin' />
                            ) : (
                                <FloppyDiskIcon className='h-4 w-4' />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{saveTooltip}</TooltipContent>
                </Tooltip>
            )}
        </div>
    )
}

export default SecretField