import type { FC, ReactNode } from 'react'
import type { SkillsEmptyStateProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { LightningIcon } from '@phosphor-icons/react'
import { PanelPlaceholder } from '@/components/shared'

const SkillsEmptyState: FC<SkillsEmptyStateProps> = ({
    hasSearch,
    isAgentMode
}): ReactNode => {
    return (
        <div className='flex flex-1 items-center justify-center'>
            <PanelPlaceholder
                icon={
                    <LightningIcon
                        className='text-muted-foreground h-6 w-6'
                        weight='duotone'
                    />
                }
                title={
                    hasSearch
                        ? t('playground.skillsNoResults')
                        : t('playground.skillsEmpty')
                }
                description={
                    isAgentMode
                        ? t('playground.agentSkillsEmptyDescription')
                        : t('playground.clawHubEmptyDescription')
                }
            />
        </div>
    )
}

export default SkillsEmptyState