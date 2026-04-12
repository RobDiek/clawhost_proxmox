import type { FC, ReactNode } from 'react'
import type { ClawBillingContentProps } from '@/ts/Interfaces'

import ClawBillingSubscription from '@/components/dashboard/ClawBillingSubscription'
import ClawBillingHistory from '@/components/dashboard/ClawBillingHistory'

const ClawBillingContent: FC<ClawBillingContentProps> = ({
    claw,
    plans
}): ReactNode => {
    const plan = plans.find((p) => p.id === claw.planId)

    return (
        <div className='h-full space-y-3 overflow-y-auto px-5 py-3.5'>
            <ClawBillingSubscription claw={claw} plan={plan} />
            <div className='h-5' />
            <ClawBillingHistory polarSubscriptionId={claw.polarSubscriptionId} />
        </div>
    )
}

export default ClawBillingContent