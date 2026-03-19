import type { FC, ReactNode } from 'react'
import type { BillingIntervalSelectorProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { billingInterval } from '@openclaw/shared'
import { Label } from '@/components/ui'

const BillingIntervalSelector: FC<BillingIntervalSelectorProps> = ({
    billingCycle,
    onBillingCycleChange
}): ReactNode => {
    return (
        <div className='space-y-1'>
            <Label>{t('createClaw.billingInterval')}</Label>
            <div className='bg-muted flex w-fit rounded-lg p-1'>
                <button
                    type='button'
                    onClick={() => onBillingCycleChange(billingInterval.MONTH)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                        billingCycle === billingInterval.MONTH
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {t('createClaw.monthly')}
                </button>
                <button
                    type='button'
                    onClick={() => onBillingCycleChange(billingInterval.YEAR)}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                        billingCycle === billingInterval.YEAR
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {t('createClaw.yearly')}
                    <span className='rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-violet-400'>
                        {t('createClaw.yearlySaveBadge')}
                    </span>
                </button>
            </div>
        </div>
    )
}

export default BillingIntervalSelector