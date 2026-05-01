import type { Agent, Plan } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'

const getPlanCostLabel = (agent: Agent, plan: Plan | undefined): string | null => {
    if (!plan) return null
    if (agent.billingInterval === 'year') {
        return t('landing.pricePerYear', { price: plan.priceYearly.toFixed(0) })
    }
    return t('landing.pricePerMonth', { price: plan.priceMonthly.toFixed(0) })
}

export default getPlanCostLabel