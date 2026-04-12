import type { FC, ReactNode } from 'react'
import type { AccountBillingSectionProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Button } from '@/components/ui'
import {
    CircleNotchIcon,
    ArrowSquareOutIcon,
    CreditCardIcon
} from '@phosphor-icons/react'

const AccountBillingSection: FC<AccountBillingSectionProps> = ({
    isPortalLoading,
    onManageBilling
}): ReactNode => {
    return (
        <div className='border-border bg-foreground/5 mt-6 rounded-xl border p-8 backdrop-blur-sm'>
            <div className='mb-6'>
                <h2 className='text-lg font-medium'>
                    {t('account.billingAndSubscription')}
                </h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    {t('account.billingAndSubscriptionDescription')}
                </p>
            </div>

            <div className='border-border flex items-center justify-between rounded-lg border px-5 py-4'>
                <div className='flex items-center gap-3'>
                    <CreditCardIcon className='text-foreground/60 h-5 w-5' />
                    <span className='text-sm font-medium'>
                        {t('account.viewBillingHistory')}
                    </span>
                </div>
                <Button
                    size='sm'
                    onClick={onManageBilling}
                    disabled={isPortalLoading}
                >
                    {isPortalLoading ? (
                        <CircleNotchIcon className='h-4 w-4 animate-spin' />
                    ) : (
                        <ArrowSquareOutIcon className='h-4 w-4' />
                    )}
                    {t('billing.manageBilling')}
                </Button>
            </div>
        </div>
    )
}

export default AccountBillingSection