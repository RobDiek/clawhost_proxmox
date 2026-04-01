import type { FC, ReactNode } from 'react'
import type { ProviderSelectorProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Label } from '@/components/ui'
import { ProviderIcon } from '@/components/shared'

const ProviderSelector: FC<ProviderSelectorProps> = ({
    atCapacity
}): ReactNode => {
    return (
        <div className='space-y-1'>
            <Label>
                {t('createClaw.provider')}
                <span className='text-red-600 dark:text-red-400'> *</span>
            </Label>
            <div className='bg-muted flex w-fit rounded-lg p-1'>
                <div className='bg-background text-foreground flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm'>
                    <ProviderIcon
                        provider='hetzner'
                        className='h-4 w-4'
                    />
                    {t('createClaw.providerHetzner')}
                </div>
            </div>
            {atCapacity && (
                <p className='mt-2 rounded-md bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400'>
                    {t('createClaw.providerAtCapacity')}
                </p>
            )}
        </div>
    )
}

export default ProviderSelector