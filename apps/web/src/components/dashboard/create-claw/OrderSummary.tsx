import type { FC, ReactNode } from 'react'
import type { OrderSummaryProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { billingInterval } from '@openclaw/shared'

const OrderSummary: FC<OrderSummaryProps> = ({
    selectedPlan,
    name,
    location,
    locations,
    billingCycle,
    volumeSize,
    volumePricing
}): ReactNode => {
    return (
        <div className='bg-muted space-y-2 rounded-lg p-4'>
            {name && (
                <div className='flex justify-between text-sm'>
                    <span className='text-muted-foreground'>
                        {t('createClaw.clawName')}
                    </span>
                    <span>{name}</span>
                </div>
            )}
            {location && (
                <div className='flex justify-between text-sm'>
                    <span className='text-muted-foreground'>
                        {t('createClaw.location')}
                    </span>
                    <span>
                        {locations.find((l) => l.id === location)?.city ||
                            location}
                    </span>
                </div>
            )}
            <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>
                    {selectedPlan.name.replace(/([A-Za-z])(\d)/, '$1 $2')}
                </span>
                <span>
                    $
                    {billingCycle === billingInterval.YEAR
                        ? selectedPlan.priceYearly.toFixed(2)
                        : selectedPlan.priceMonthly.toFixed(2)}
                    {billingCycle === billingInterval.YEAR
                        ? t('landing.perYear')
                        : t('landing.perMonth')}
                </span>
            </div>
            {volumeSize > 0 && volumePricing && (
                <div className='flex justify-between text-sm'>
                    <span className='text-muted-foreground'>
                        {t('createClaw.storageWithSize')} ({volumeSize} GB)
                    </span>
                    <span>
                        +$
                        {(billingCycle === billingInterval.YEAR
                            ? volumeSize * volumePricing.pricePerGbMonthly * 10
                            : volumeSize * volumePricing.pricePerGbMonthly
                        ).toFixed(2)}
                        {billingCycle === billingInterval.YEAR
                            ? t('landing.perYear')
                            : t('landing.perMonth')}
                    </span>
                </div>
            )}
            {billingCycle === billingInterval.YEAR && (
                <div className='flex justify-between text-sm text-emerald-600 dark:text-emerald-400'>
                    <span>{t('createClaw.yearlySavings')}</span>
                    <span>
                        -$
                        {(
                            selectedPlan.priceMonthly * 12 -
                            selectedPlan.priceYearly +
                            (volumeSize > 0 && volumePricing
                                ? volumeSize *
                                  volumePricing.pricePerGbMonthly *
                                  2
                                : 0)
                        ).toFixed(2)}
                    </span>
                </div>
            )}
            <div className='border-border flex justify-between border-t pt-2 text-sm'>
                <span className='text-muted-foreground'>
                    {billingCycle === billingInterval.YEAR
                        ? t('createClaw.totalYearly')
                        : t('createClaw.totalMonthly')}
                </span>
                <span className='font-semibold'>
                    $
                    {(billingCycle === billingInterval.YEAR
                        ? selectedPlan.priceYearly +
                          (volumeSize > 0 && volumePricing
                              ? volumeSize *
                                volumePricing.pricePerGbMonthly *
                                10
                              : 0)
                        : selectedPlan.priceMonthly +
                          (volumeSize > 0 && volumePricing
                              ? volumeSize * volumePricing.pricePerGbMonthly
                              : 0)
                    ).toFixed(2)}
                    {billingCycle === billingInterval.YEAR
                        ? t('landing.perYear')
                        : t('landing.perMonth')}
                </span>
            </div>
        </div>
    )
}

export default OrderSummary