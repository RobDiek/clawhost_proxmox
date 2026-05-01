import type { Plan, VolumePricing } from '@/ts/Interfaces'
import type { BillingInterval } from '@/ts/Types'

import { billingInterval, YEARLY_PAID_MONTHS } from '@openclaw/shared'

const ZERO_AMOUNT = '0.00'

const calculateTotalAmount = (
    selectedPlan: Plan | undefined,
    billingCycle: BillingInterval,
    volumeSize: number,
    volumePricing?: VolumePricing
): string => {
    if (!selectedPlan) return ZERO_AMOUNT
    const isYearly = billingCycle === billingInterval.YEAR
    const planPrice = isYearly
        ? selectedPlan.priceYearly
        : selectedPlan.priceMonthly
    const hasVolume = volumeSize > 0 && volumePricing
    const monthlyVolumePrice = hasVolume
        ? volumeSize * volumePricing.pricePerGbMonthly
        : 0
    const volumeCost = isYearly
        ? monthlyVolumePrice * YEARLY_PAID_MONTHS
        : monthlyVolumePrice
    return (planPrice + volumeCost).toFixed(2)
}

export default calculateTotalAmount