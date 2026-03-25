import type { FC, ReactNode } from 'react'

import { useEffect, useState } from 'react'
import { CheckIcon, WarningIcon, XIcon, InfoIcon } from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'
import { useUIStore } from '@/lib/store'

const icons = {
    success: CheckIcon,
    error: WarningIcon,
    warning: WarningIcon,
    info: InfoIcon
}

const colors = {
    success:
        'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400',
    error: 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400',
    warning:
        'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400',
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
}

const iconColors = {
    success: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    info: 'text-blue-600 dark:text-blue-400'
}

const Toast: FC = (): ReactNode => {
    const { toast, hideToast } = useUIStore()
    const [exiting, setExiting] = useState(false)

    useEffect(() => {
        if (toast) {
            setExiting(false)
            const timer = setTimeout(
                () => {
                    setExiting(true)
                    setTimeout(hideToast, 150)
                },
                (toast.duration || 5000) - 150
            )
            return () => clearTimeout(timer)
        }
        setExiting(false)
    }, [toast, hideToast])

    if (!toast) return null

    const Icon = icons[toast.type]

    return (
        <div
            className={`fixed left-1/2 top-6 z-[100] ${exiting ? 'animate-toast-out' : 'animate-toast-in'}`}
        >
            <div
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm ${colors[toast.type]}`}
            >
                <Icon
                    className={`h-5 w-5 ${iconColors[toast.type]}`}
                    weight='fill'
                />
                <span className='text-foreground text-sm font-medium'>
                    {toast.message}
                </span>
                <button
                    onClick={hideToast}
                    aria-label={t('common.closeNotification')}
                    className='text-muted-foreground hover:text-foreground ml-2 transition'
                >
                    <XIcon className='h-4 w-4' />
                </button>
            </div>
        </div>
    )
}

export default Toast