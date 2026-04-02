import type { FC, ReactNode } from 'react'
import type { AffiliatePaymentHistoryProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { getLocale } from '@/lib'
import { EmptyState } from '@/components'
import { Skeleton } from '@/components/ui'
import { UsersThreeIcon, CurrencyDollarIcon } from '@phosphor-icons/react'

const AffiliatePaymentHistory: FC<AffiliatePaymentHistoryProps> = ({
    payments,
    isLoading,
    formatCurrency
}): ReactNode => {
    return (
        <div className='border-border bg-foreground/5 rounded-lg border p-5'>
            <p className='text-muted-foreground mb-3 text-sm font-medium'>
                {t('affiliate.paymentHistory')}
            </p>
            {isLoading ? (
                <div className='space-y-2'>
                    <Skeleton className='bg-foreground/10 h-16 w-full rounded-lg' />
                    <Skeleton className='bg-foreground/10 h-16 w-full rounded-lg' />
                    <Skeleton className='bg-foreground/10 h-16 w-full rounded-lg' />
                    <Skeleton className='bg-foreground/10 h-16 w-full rounded-lg' />
                    <Skeleton className='bg-foreground/10 h-16 w-full rounded-lg' />
                </div>
            ) : payments.length > 0 ? (
                <div className='space-y-2'>
                    {payments.map((payment) => (
                        <div
                            key={payment.id}
                            className='border-border bg-foreground/5 flex items-center justify-between rounded-lg border px-4 py-3'
                        >
                            <div>
                                <p className='text-sm font-medium'>
                                    {payment.referredEmail}
                                </p>
                                <p className='text-muted-foreground text-xs'>
                                    {new Date(
                                        payment.createdAt
                                    ).toLocaleDateString(getLocale(), {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric'
                                    })}
                                </p>
                            </div>
                            <div className='flex items-center gap-3'>
                                <span className='bg-foreground/10 rounded-full px-2.5 py-0.5 text-xs capitalize'>
                                    {payment.type}
                                </span>
                                {payment.amount > 0 && (
                                    <span className='flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400'>
                                        <CurrencyDollarIcon className='h-3.5 w-3.5' />
                                        {formatCurrency(payment.amount)}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={<UsersThreeIcon className='text-primary h-10 w-10' />}
                    title={t('affiliate.noPaymentsYet')}
                    description={t('affiliate.noPaymentsDescription')}
                />
            )}
        </div>
    )
}

export default AffiliatePaymentHistory