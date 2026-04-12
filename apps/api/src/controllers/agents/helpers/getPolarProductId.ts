import type { BillingInterval } from '@/ts/Types'

import { billingInterval } from '@openclaw/shared'

const PLAN_TO_POLAR: Record<string, string> = {
    cx23: 'CX23',
    cx33: 'CX33',
    cx43: 'CX43',
    cx53: 'CX53',
    cpx11: 'CPX11',
    cpx21: 'CPX21',
    cpx31: 'CPX31',
    cpx41: 'CPX41',
    cpx51: 'CPX51',
    cax11: 'CAX11',
    cax21: 'CAX21',
    cax31: 'CAX31',
    cax41: 'CAX41',
    ccx13: 'CCX13',
    ccx23: 'CCX23',
    ccx33: 'CCX33',
    ccx43: 'CCX43',
    ccx53: 'CCX53',
    ccx63: 'CCX63'
}

const getPolarProductId = (
    planId: string,
    interval: BillingInterval = billingInterval.MONTH
): string | null => {
    const polarName = PLAN_TO_POLAR[planId.toLowerCase()]
    if (!polarName) return null

    const suffix = interval === billingInterval.YEAR ? '_YEARLY' : '_MONTHLY'
    const envKey = `POLAR_PRODUCT_${polarName}${suffix}`
    const envValue = process.env[envKey]

    if (envValue) return envValue
    else return null
}

export default getPolarProductId