import type { FC, ReactNode } from 'react'
import type { AdminPendingClawDetailViewProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { getLocale } from '@/lib'
import { DialogHeader, DialogTitle, Button } from '@/components/ui'
import { HourglassIcon } from '@phosphor-icons/react'
import AdminDetailField from '@/components/admin/AdminDetailField'
import AdminOwnerLink from '@/components/admin/AdminOwnerLink'

const AdminPendingClawDetailView: FC<AdminPendingClawDetailViewProps> = ({
    pendingClaw,
    onClose,
    onNavigateToUser
}): ReactNode => {
    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return t('admin.notSet')
        return new Date(dateString).toLocaleDateString(getLocale(), {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const formatCurrency = (amount: number, currency: string = 'usd') => {
        return new Intl.NumberFormat(getLocale(), {
            style: 'currency',
            currency: currency.toUpperCase()
        }).format(amount / 100)
    }

    return (
        <Fragment>
            <DialogHeader>
                <DialogTitle className='flex items-center gap-2'>
                    <HourglassIcon className='h-5 w-5' />
                    {pendingClaw.name}
                </DialogTitle>
            </DialogHeader>
            <div className='space-y-4 pt-8'>
                <div className='border-border rounded-lg border p-4'>
                    <div className='grid grid-cols-1 gap-4 text-sm sm:grid-cols-2'>
                        <div className='space-y-1'>
                            <p className='text-muted-foreground text-xs'>
                                {t('admin.owner')}
                            </p>
                            <AdminOwnerLink
                                userId={pendingClaw.userId}
                                email={pendingClaw.ownerEmail}
                                onNavigateToUser={onNavigateToUser}
                            />
                        </div>
                        <AdminDetailField
                            label={t('admin.plan')}
                            value={pendingClaw.planId}
                        />
                        <AdminDetailField
                            label={t('admin.location')}
                            value={pendingClaw.location}
                        />
                        <AdminDetailField
                            label={t('admin.price')}
                            value={t('admin.pricePerMonth', {
                                price: formatCurrency(pendingClaw.priceMonthly)
                            })}
                        />
                        <AdminDetailField
                            label={t('admin.joined')}
                            value={formatDate(pendingClaw.createdAt)}
                        />
                        <AdminDetailField
                            label={t('admin.expiresAt')}
                            value={formatDate(pendingClaw.expiresAt)}
                        />
                    </div>
                </div>
                <div className='flex justify-end'>
                    <Button variant='outline' onClick={onClose}>
                        {t('common.close')}
                    </Button>
                </div>
            </div>
        </Fragment>
    )
}

export default AdminPendingClawDetailView