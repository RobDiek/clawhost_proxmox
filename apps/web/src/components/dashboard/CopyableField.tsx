import type { FC, ReactNode } from 'react'
import type { CopyableFieldProps } from '@/ts/Interfaces'

import { useState } from 'react'
import { t } from '@openclaw/i18n'
import { useToast, useCopyWithFeedback } from '@/hooks'
import {
    CheckIcon,
    CopyIcon,
    EyeIcon,
    EyeSlashIcon
} from '@phosphor-icons/react'

const CopyableField: FC<CopyableFieldProps> = ({
    label,
    value,
    icon,
    secret
}): ReactNode => {
    const [isRevealed, setIsRevealed] = useState(false)
    const toast = useToast()
    const { copied, copy } = useCopyWithFeedback()

    const handleCopy = () => {
        copy(value)
        toast.success(t('common.copiedWithLabel', { label }))
    }

    const handleToggleReveal = (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsRevealed((prev) => !prev)
    }

    return (
        <div
            onClick={handleCopy}
            className='bg-foreground/5 hover:bg-foreground/10 group flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors'
        >
            <div className='min-w-0'>
                <span className='text-muted-foreground block text-xs'>
                    {label}
                </span>
                <span className='flex items-center gap-1.5 truncate font-mono text-sm'>
                    {icon}
                    {secret && !isRevealed
                        ? '\u2022'.repeat(Math.min(value.length, 32))
                        : value}
                </span>
            </div>
            <div className='flex shrink-0 items-center gap-1'>
                {secret && (
                    <button
                        onClick={handleToggleReveal}
                        className='text-muted-foreground hover:text-foreground flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-[colors,opacity] group-hover:opacity-100'
                    >
                        {isRevealed ? (
                            <EyeSlashIcon className='h-4 w-4' />
                        ) : (
                            <EyeIcon className='h-4 w-4' />
                        )}
                    </button>
                )}
                {copied ? (
                    <CheckIcon className='h-4 w-4 text-green-500' />
                ) : (
                    <CopyIcon className='text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100' />
                )}
            </div>
        </div>
    )
}

export default CopyableField