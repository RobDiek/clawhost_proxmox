import type { FC, ReactNode } from 'react'
import type { TotalSpentTileProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { formatCurrencyFromCents } from '@/lib/formatters'
import { CopyableField } from '@/components/dashboard'

const PLACEHOLDER_VALUE = formatCurrencyFromCents(0)

const TotalSpentTile: FC<TotalSpentTileProps> = ({
    loading,
    value
}): ReactNode => {
    const label = t('dashboard.totalSpent')

    if (loading) {
        return (
            <div className='bg-foreground/5 flex items-center justify-between gap-2 rounded-lg px-3 py-2'>
                <div className='min-w-0'>
                    <span className='text-muted-foreground block text-xs'>
                        {label}
                    </span>
                    <span className='flex items-center gap-1.5 truncate font-mono text-sm'>
                        <span className='bg-primary/10 animate-pulse rounded-full px-2 text-transparent'>
                            {PLACEHOLDER_VALUE}
                        </span>
                    </span>
                </div>
            </div>
        )
    }

    if (!value) return null

    return <CopyableField label={label} value={value} />
}

export default TotalSpentTile