import type { FC, ReactNode } from 'react'
import type { AgentBillingSubscriptionProps } from '@/ts/Interfaces'

import { useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { useAgentBilling } from '@/hooks'
import { formatCurrencyFromCents, formatDate } from '@/lib/formatters'
import { getPlanCostLabel, sumOrderTotals } from '@/lib/billing'
import {
    CopyableField,
    ManageBillingButton,
    SectionHeader,
    TotalSpentTile
} from '@/components/dashboard'
import { demoBillingOrders } from '@/data'

const AgentBillingSubscription: FC<AgentBillingSubscriptionProps> = ({
    agent,
    plan,
    readOnly
}): ReactNode => {
    const { data: billingData, isLoading: isBillingLoading } = useAgentBilling(
        agent.id,
        !readOnly
    )

    const planCostLabel = getPlanCostLabel(agent, plan)

    const totalSpentLabel = useMemo(() => {
        const orders = readOnly ? demoBillingOrders : (billingData?.items ?? [])
        if (orders.length === 0) return null
        return formatCurrencyFromCents(
            sumOrderTotals(orders),
            orders[0]?.currency
        )
    }, [billingData, readOnly])

    return (
        <div className='space-y-3'>
            <SectionHeader
                title={t('dashboard.subscription')}
                action={readOnly ? undefined : <ManageBillingButton agent={agent} />}
            />

            <div className='grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4'>
                {planCostLabel && (
                    <CopyableField
                        label={t('dashboard.planCost')}
                        value={planCostLabel}
                    />
                )}
                <TotalSpentTile
                    loading={!readOnly && isBillingLoading}
                    value={totalSpentLabel}
                />
                {agent.currentPeriodStart && (
                    <CopyableField
                        label={t('dashboard.lastBilling')}
                        value={formatDate(agent.currentPeriodStart)}
                    />
                )}
                {agent.currentPeriodEnd && (
                    <CopyableField
                        label={t('dashboard.nextBilling')}
                        value={formatDate(agent.currentPeriodEnd)}
                    />
                )}
            </div>
        </div>
    )
}

export default AgentBillingSubscription