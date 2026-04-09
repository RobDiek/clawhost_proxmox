import type { FC, ReactNode } from 'react'
import type { EnvVarsEmptyStateProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { KeyIcon } from '@phosphor-icons/react'

const EnvVarsEmptyState: FC<EnvVarsEmptyStateProps> = ({
    onAdd
}): ReactNode => {
    return (
        <div className='flex flex-1 flex-col items-center justify-center gap-3'>
            <div className='bg-foreground/5 flex h-10 w-10 items-center justify-center rounded-xl'>
                <KeyIcon
                    className='text-muted-foreground h-5 w-5'
                    weight='duotone'
                />
            </div>
            <p className='text-muted-foreground text-xs'>
                {t('playground.variablesEmpty')}
            </p>
            <button
                onClick={onAdd}
                className='border-border text-muted-foreground hover:border-border hover:text-muted-foreground rounded-lg border border-dashed px-4 py-2 text-[11px] transition-colors'
            >
                {t('playground.variablesAddVariable')}
            </button>
        </div>
    )
}

export default EnvVarsEmptyState