import type { FC, ReactNode } from 'react'
import type { ConnectedAccountRowProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { CircleNotchIcon } from '@phosphor-icons/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'

const ConnectedAccountRow: FC<ConnectedAccountRowProps> = ({
    icon,
    label,
    isConnected,
    isDisabled,
    isPending,
    isLoading,
    onConnect,
    onDisconnect
}): ReactNode => {
    return (
        <div className='border-border bg-foreground/[0.02] flex items-center justify-between rounded-lg border px-4 py-3'>
            <div className='flex items-center gap-3'>
                {icon}
                <span className='text-sm font-medium'>{label}</span>
            </div>
            {isDisabled ? (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            disabled
                            className='border-border text-foreground/50 flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs opacity-50'
                        >
                            {t('account.authDisconnect')}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {t('account.emailCannotBeDisconnected')}
                    </TooltipContent>
                </Tooltip>
            ) : isConnected ? (
                <button
                    onClick={onDisconnect}
                    disabled={isPending}
                    className='border-border text-foreground/50 flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs transition-colors hover:border-red-500/50 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400'
                >
                    {isLoading && (
                        <CircleNotchIcon className='h-3 w-3 animate-spin' />
                    )}
                    {t('account.authDisconnect')}
                </button>
            ) : (
                <button
                    onClick={onConnect}
                    disabled={isPending}
                    className='flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-xs font-medium text-black transition-opacity hover:opacity-80 disabled:opacity-50'
                >
                    {isLoading && (
                        <CircleNotchIcon className='h-3 w-3 animate-spin' />
                    )}
                    {t('account.authConnect')}
                </button>
            )}
        </div>
    )
}

export default ConnectedAccountRow