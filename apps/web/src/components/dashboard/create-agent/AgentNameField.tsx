import type { FC, ReactNode } from 'react'
import type { AgentNameFieldProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Input, Label } from '@/components/ui'

const AgentNameField: FC<AgentNameFieldProps> = ({
    name,
    nameError,
    onChange
}): ReactNode => {
    return (
        <div className='space-y-2'>
            <Label>{t('createClaw.clawName')}</Label>
            <Input
                type='text'
                value={name}
                onChange={(e) => onChange(e.target.value)}
                placeholder={t('createClaw.clawNamePlaceholder')}
                className={`h-11 ${nameError ? 'border-red-500/50' : ''}`}
            />
            {nameError && (
                <p className='mt-1.5 text-[11px] text-red-600 dark:text-red-400'>
                    {nameError}
                </p>
            )}
        </div>
    )
}

export default AgentNameField