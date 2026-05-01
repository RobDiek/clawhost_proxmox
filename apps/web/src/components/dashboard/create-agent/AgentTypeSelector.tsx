import type { FC, ReactNode } from 'react'
import type { AgentTypeSelectorProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Label } from '@/components/ui'
import { agentTypes } from '@/data'

const AgentTypeSelector: FC<AgentTypeSelectorProps> = ({
    selectedAgentType,
    onAgentTypeChange,
    starsFor
}): ReactNode => {
    return (
        <div className='space-y-2'>
            <Label>{t('createClaw.agentType')}</Label>
            <div className='grid grid-cols-2 gap-2'>
                {agentTypes.map(({ type, Icon, nameKey, descriptionKey }) => {
                    const isSelected = selectedAgentType === type
                    return (
                        <button
                            key={type}
                            type='button'
                            onClick={() => onAgentTypeChange(type)}
                            className={`flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                                isSelected
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-muted-foreground/30'
                            }`}
                        >
                            <Icon size={32} />
                            <div className='leading-tight'>
                                <div className='text-sm font-medium'>
                                    {t(nameKey)}
                                </div>
                                <div className='text-muted-foreground text-[10px]'>
                                    {t(descriptionKey, {
                                        count: starsFor(type)
                                    })}
                                </div>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export default AgentTypeSelector