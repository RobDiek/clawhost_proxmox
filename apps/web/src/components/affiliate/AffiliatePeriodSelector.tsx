import type { FC, ReactNode } from 'react'
import type { AffiliatePeriodSelectorProps } from '@/ts/Interfaces'
import type { AffiliatePeriod } from '@/ts/Types'
import type { TranslationKey } from '@openclaw/i18n'

import { t } from '@openclaw/i18n'
import { AFFILIATE_PERIOD } from '@/lib/constants'

const PERIODS = Object.values(AFFILIATE_PERIOD)

const PERIOD_LABELS: Record<AffiliatePeriod, TranslationKey> = {
    [AFFILIATE_PERIOD.TODAY]: 'affiliate.periodToday',
    [AFFILIATE_PERIOD.WEEK]: 'affiliate.periodWeek',
    [AFFILIATE_PERIOD.MONTH]: 'affiliate.periodMonth',
    [AFFILIATE_PERIOD.YEAR]: 'affiliate.periodYear',
    [AFFILIATE_PERIOD.ALL]: 'affiliate.periodAll'
}

const AffiliatePeriodSelector: FC<AffiliatePeriodSelectorProps> = ({
    period,
    onPeriodChange
}): ReactNode => {
    return (
        <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-1'>
                {PERIODS.map((p) => (
                    <button
                        key={p}
                        type='button'
                        onClick={() => onPeriodChange(p)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                            period === p
                                ? 'bg-foreground/10 text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {t(PERIOD_LABELS[p])}
                    </button>
                ))}
            </div>
        </div>
    )
}

export default AffiliatePeriodSelector