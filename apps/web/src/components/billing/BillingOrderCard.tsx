import type { FC, ReactNode } from 'react'
import type { BillingOrderCardProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Card, CardContent, Button } from '@/components/ui'
import { CircleNotchIcon, DownloadSimpleIcon } from '@phosphor-icons/react'

const BillingOrderCard: FC<BillingOrderCardProps> = ({
    order,
    loadingInvoiceIds,
    onViewInvoice,
    formatDate,
    formatCurrency,
    getStatusBadge,
    getBillingReasonLabel
}): ReactNode => {
    return (
        <Card>
            <CardContent className='py-4'>
                <div className='hidden sm:flex sm:items-center sm:justify-between'>
                    <div>
                        <h3 className='font-semibold'>
                            {order.productName ||
                                getBillingReasonLabel(order.billingReason)}
                        </h3>
                        <p className='text-muted-foreground text-sm'>
                            {formatDate(order.createdAt)}
                        </p>
                    </div>
                    <div className='flex items-center gap-4'>
                        <div className='text-right text-sm'>
                            <div className='flex items-center gap-2 font-medium'>
                                {order.discountAmount > 0 && (
                                    <span className='text-muted-foreground line-through'>
                                        {formatCurrency(
                                            order.subtotalAmount,
                                            order.currency
                                        )}
                                    </span>
                                )}
                                <span>
                                    {formatCurrency(
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
                        {getStatusBadge(order.status)}
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
                                {order.productName ||
                                    getBillingReasonLabel(order.billingReason)}
                            </h3>
                            <p className='text-muted-foreground text-sm'>
                                {formatDate(order.createdAt)}
                            </p>
                        </div>
                        {getStatusBadge(order.status)}
                    </div>
                    <div className='flex items-center justify-between'>
                        <div className='text-sm'>
                            <div className='flex items-center gap-2 font-medium'>
                                {order.discountAmount > 0 && (
                                    <span className='text-muted-foreground line-through'>
                                        {formatCurrency(
                                            order.subtotalAmount,
                                            order.currency
                                        )}
                                    </span>
                                )}
                                <span>
                                    {formatCurrency(
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