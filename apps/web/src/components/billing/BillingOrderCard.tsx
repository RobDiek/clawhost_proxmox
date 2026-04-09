import type { FC, ReactNode } from 'react'
import type { BillingOrderCardProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Card, CardContent, Button } from '@/components/ui'
import { CircleNotchIcon, DownloadSimpleIcon } from '@phosphor-icons/react'
import { formatLongDate, formatCurrencyFromCents } from '@/lib/formatters'
import { billingReasonLabels } from '@/lib/billing'
import BillingStatusBadge from '@/components/billing/BillingStatusBadge'

const BillingOrderCard: FC<BillingOrderCardProps> = ({
    order,
    loadingInvoiceIds,
    onViewInvoice
}): ReactNode => {
    const reasonLabelKey = billingReasonLabels[order.billingReason]
    const reasonLabel = reasonLabelKey ? t(reasonLabelKey) : order.billingReason

    return (
        <Card>
            <CardContent className='py-4'>
                <div className='hidden sm:flex sm:items-center sm:justify-between'>
                    <div>
                        <h3 className='font-semibold'>
                            {order.productName || reasonLabel}
                        </h3>
                        <p className='text-muted-foreground text-sm'>
                            {formatLongDate(order.createdAt)}
                        </p>
                    </div>
                    <div className='flex items-center gap-4'>
                        <div className='text-right text-sm'>
                            <div className='flex items-center gap-2 font-medium'>
                                {order.discountAmount > 0 && (
                                    <span className='text-muted-foreground line-through'>
                                        {formatCurrencyFromCents(
                                            order.subtotalAmount,
                                            order.currency
                                        )}
                                    </span>
                                )}
                                <span>
                                    {formatCurrencyFromCents(
                                        order.totalAmount,
                                        order.currency
                                    )}
                                </span>
                            </div>
                            {order.discountName && (
                                <p className='text-muted-foreground text-xs'>
                                    {t('billing.couponApplied', {
                                        name: order.discountName
                                    })}
                                </p>
                            )}
                        </div>
                        <BillingStatusBadge status={order.status} />
                        <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => onViewInvoice(order.id)}
                            disabled={loadingInvoiceIds.has(order.id)}
                            title={t('billing.viewInvoice')}
                        >
                            {loadingInvoiceIds.has(order.id) ? (
                                <CircleNotchIcon className='h-5 w-5 animate-spin' />
                            ) : (
                                <DownloadSimpleIcon className='h-5 w-5' />
                            )}
                        </Button>
                    </div>
                </div>
                <div className='flex flex-col gap-3 sm:hidden'>
                    <div className='flex items-start justify-between'>
                        <div>
                            <h3 className='font-semibold'>
                                {order.productName || reasonLabel}
                            </h3>
                            <p className='text-muted-foreground text-sm'>
                                {formatLongDate(order.createdAt)}
                            </p>
                        </div>
                        <BillingStatusBadge status={order.status} />
                    </div>
                    <div className='flex items-center justify-between'>
                        <div className='text-sm'>
                            <div className='flex items-center gap-2 font-medium'>
                                {order.discountAmount > 0 && (
                                    <span className='text-muted-foreground line-through'>
                                        {formatCurrencyFromCents(
                                            order.subtotalAmount,
                                            order.currency
                                        )}
                                    </span>
                                )}
                                <span>
                                    {formatCurrencyFromCents(
                                        order.totalAmount,
                                        order.currency
                                    )}
                                </span>
                            </div>
                            {order.discountName && (
                                <p className='text-muted-foreground text-xs'>
                                    {t('billing.couponApplied', {
                                        name: order.discountName
                                    })}
                                </p>
                            )}
                        </div>
                        <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => onViewInvoice(order.id)}
                            disabled={loadingInvoiceIds.has(order.id)}
                            title={t('billing.viewInvoice')}
                        >
                            {loadingInvoiceIds.has(order.id) ? (
                                <CircleNotchIcon className='h-5 w-5 animate-spin' />
                            ) : (
                                <DownloadSimpleIcon className='h-5 w-5' />
                            )}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

export default BillingOrderCard