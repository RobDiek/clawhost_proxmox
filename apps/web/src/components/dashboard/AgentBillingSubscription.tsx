import type { FC, ReactNode } from 'react'
import type { AgentBillingSubscriptionProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { CreditCardIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { useCustomerPortal } from '@/hooks'
import { getLocale } from '@/lib'
import { CopyableField, SectionHeader } from '@/components/dashboard'
import { Button } from '@/components/ui'

const AgentBillingSubscription: FC<AgentBillingSubscriptionProps> = ({
    agent,
    plan,
    readOnly
}): ReactNode => {
    const monthlyPrice = plan ? plan.priceMonthly : null
    const { openPortal, isLoading: isPortalLoading } = useCustomerPortal()

    const manageBillingAction =
        readOnly ? undefined : agent.polarSubscriptionId ? (
            <Button
                variant='outline'
                size='sm'
                onClick={() => openPortal(agent.id)}
                disabled={isPortalLoading}
                className={
                    agent.subscriptionStatus === 'past_due'
                        ? 'border-orange-500/50 text-orange-600 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-400'
                        : ''
                }
            >
                {isPortalLoading ? (
                    <CircleNotchIcon className='mr-2 h-3.5 w-3.5 animate-spin' />
                ) : (
                    <CreditCardIcon className='mr-2 h-3.5 w-3.5' />
                )}
                {agent.subscriptionStatus === 'past_due'
                    ? t('dashboard.updatePayment')
                    : t('billing.manageBilling')}
            </Button>
        ) : undefined

    return (
        <div className='space-y-3'>
            <SectionHeader
                title={t('dashboard.subscription')}
                action={manageBillingAction}
            />

            <div className='grid grid-cols-1 gap-2 md:grid-cols-3'>
                {monthlyPrice && (
                    <CopyableField
                        label={t('dashboard.planCost')}
                        value={
                            agent.billingInterval === 'year' && plan
                                ? t('landing.pricePerYear', {
                                      price: plan.priceYearly.toFixed(0)
                                  })
                                : t('landing.pricePerMonth', {
                                      price: monthlyPrice.toFixed(0)
                                  })
                        }
                    />
                )}
                {agent.currentPeriodStart && (
                    <CopyableField
                        label={t('dashboard.lastBilling')}
                        value={new Date(
                            agent.currentPeriodStart
                        ).toLocaleDateString(getLocale(), {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        })}
                    />
                )}
                {agent.currentPeriodEnd && (
                    <CopyableField
                        label={t('dashboard.nextBilling')}
                        value={new Date(
                            agent.currentPeriodEnd
                        ).toLocaleDateString(getLocale(), {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        })}
                    />
                )}
            </div>
        </div>
    )
}

export default AgentBillingSubscription