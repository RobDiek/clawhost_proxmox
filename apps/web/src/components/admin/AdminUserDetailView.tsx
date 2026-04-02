import type { FC, ReactNode } from 'react'
import type {
    AdminUserDetailViewProps,
    AdminUserDetailClaw,
    AdminUserDetailSSHKey,
    AdminUserDetailVolume,
    BillingOrder
} from '@/ts/Interfaces'

import { Fragment, useState, useEffect } from 'react'
import { t } from '@openclaw/i18n'
import { getLocale } from '@/lib'
import { useAdminUserDetail, useUpdateAdminUser } from '@/hooks'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import {
    DialogHeader,
    DialogTitle,
    Badge,
    Button,
    Card,
    CardContent,
    Input
} from '@/components/ui'
import {
    CircleNotchIcon,
    UserIcon,
    HardDrivesIcon,
    KeyIcon,
    DatabaseIcon,
    ReceiptIcon,
    ShieldCheckIcon,
    FloppyDiskIcon
} from '@phosphor-icons/react'
import { userRole } from '@openclaw/shared'
import AdminDetailField from '@/components/admin/AdminDetailField'
import AdminStatusBadge from '@/components/admin/AdminStatusBadge'

const AdminUserDetailView: FC<AdminUserDetailViewProps> = ({
    userId,
    onClose
}): ReactNode => {
    const { data: user, isLoading } = useAdminUserDetail(userId)
    const updateMutation = useUpdateAdminUser()
    const { showToast } = useUIStore()
    const [editName, setEditName] = useState('')
    const [editReferralCode, setEditReferralCode] = useState('')

    useEffect(() => {
        if (user) {
            setEditName(user.name || '')
            setEditReferralCode(user.referralCode || '')
        }
    }, [user])

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

    const handleSave = async () => {
        try {
            await updateMutation.mutateAsync({
                id: userId,
                data: {
                    name: editName || null,
                    referralCode: editReferralCode || null
                }
            })
            showToast(t('admin.userUpdated'), TOAST_TYPE.SUCCESS)
        } catch {
            showToast(t('admin.userUpdateFailed'), TOAST_TYPE.ERROR)
        }
    }

    if (isLoading) {
        return (
            <Fragment>
                <DialogHeader>
                    <DialogTitle>{t('admin.userDetail')}</DialogTitle>
                </DialogHeader>
                <div className='flex items-center justify-center py-12'>
                    <CircleNotchIcon className='text-primary h-8 w-8 animate-spin' />
                </div>
            </Fragment>
        )
    }

    if (!user) {
        return (
            <Fragment>
                <DialogHeader>
                    <DialogTitle>{t('admin.userDetail')}</DialogTitle>
                </DialogHeader>
                <div className='text-destructive py-8 text-center text-sm'>
                    {t('admin.failedToLoadUserDetail')}
                </div>
            </Fragment>
        )
    }

    return (
        <Fragment>
            <DialogHeader>
                <DialogTitle>{t('admin.userDetail')}</DialogTitle>
            </DialogHeader>
            <div className='space-y-6 pt-8'>
                <div className='flex items-center gap-3'>
                    <div className='bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full'>
                        <UserIcon className='text-primary h-5 w-5' />
                    </div>
                    <div className='min-w-0 flex-1'>
                        <div className='flex items-center gap-2'>
                            <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder={t('admin.name')}
                                className='bg-background h-8 text-base font-semibold'
                            />
                            {user.role === userRole.admin && (
                                <Badge className='pointer-events-none shrink-0 border-purple-500/30 bg-purple-500/20 text-purple-600 dark:text-purple-400'>
                                    <ShieldCheckIcon className='mr-1 h-3 w-3' />
                                    {t('admin.adminBadge')}
                                </Badge>
                            )}
                        </div>
                        <p className='text-muted-foreground mt-0.5 text-sm'>
                            {user.email}
                        </p>
                    </div>
                </div>

                <div className='border-border rounded-lg border p-4'>
                    <h4 className='mb-3 text-sm font-medium'>
                        {t('admin.userInfo')}
                    </h4>
                    <div className='grid grid-cols-1 gap-4 text-sm sm:grid-cols-2'>
                        <AdminDetailField
                            label={t('admin.email')}
                            value={
                                <span className='truncate font-mono text-xs'>
                                    {user.email}
                                </span>
                            }
                        />
                        <AdminDetailField
                            label={t('admin.role')}
                            value={user.role}
                        />
                        <AdminDetailField
                            label={t('admin.authMethods')}
                            value={
                                user.authMethods?.join(', ') ||
                                t('admin.notSet')
                            }
                        />
                        <AdminDetailField
                            label={t('admin.license')}
                            value={
                                user.hasLicense
                                    ? t('admin.hasLicense')
                                    : t('admin.noLicense')
                            }
                        />
                        <div className='space-y-1'>
                            <p className='text-muted-foreground text-xs'>
                                {t('admin.referralCode')}
                            </p>
                            <Input
                                value={editReferralCode}
                                onChange={(e) =>
                                    setEditReferralCode(e.target.value)
                                }
                                placeholder={t('admin.referralCode')}
                                className='bg-background h-7 font-mono text-xs'
                            />
                        </div>
                        <AdminDetailField
                            label={t('admin.referredBy')}
                            value={
                                <span className='font-mono text-xs'>
                                    {user.referredBy || t('admin.notSet')}
                                </span>
                            }
                        />
                        <AdminDetailField
                            label={t('admin.joined')}
                            value={formatDate(user.createdAt)}
                            className='sm:col-span-2'
                        />
                    </div>
                </div>

                <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                        <HardDrivesIcon className='h-4 w-4' />
                        <h4 className='text-sm font-medium'>
                            {t('admin.claws')}
                            {user.claws.length > 0 && ` (${user.claws.length})`}
                        </h4>
                    </div>
                    {user.claws.length === 0 ? (
                        <div className='border-border rounded-lg border p-4 text-center'>
                            <p className='text-muted-foreground text-sm'>
                                {t('admin.noClaws')}
                            </p>
                        </div>
                    ) : (
                        <div className='space-y-2'>
                            {user.claws.map((claw: AdminUserDetailClaw) => (
                                <Card key={claw.id}>
                                    <CardContent className='py-3'>
                                        <div className='flex items-center justify-between gap-2'>
                                            <div className='flex min-w-0 items-center gap-3'>
                                                <div className='bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full'>
                                                    <HardDrivesIcon className='text-muted-foreground h-4 w-4' />
                                                </div>
                                                <div className='min-w-0'>
                                                    <span className='truncate font-medium'>
                                                        {claw.name}
                                                    </span>
                                                    <p className='text-muted-foreground truncate text-xs'>
                                                        {claw.ip ||
                                                            t(
                                                                'admin.notSet'
                                                            )}{' '}
                                                        · {claw.planId} ·{' '}
                                                        {claw.location ||
                                                            t('admin.notSet')}
                                                    </p>
                                                </div>
                                            </div>
                                            <AdminStatusBadge
                                                status={claw.status}
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                        <KeyIcon className='h-4 w-4' />
                        <h4 className='text-sm font-medium'>
                            {t('admin.sshKeys')}
                            {user.sshKeys.length > 0 &&
                                ` (${user.sshKeys.length})`}
                        </h4>
                    </div>
                    {user.sshKeys.length === 0 ? (
                        <div className='border-border rounded-lg border p-4 text-center'>
                            <p className='text-muted-foreground text-sm'>
                                {t('admin.noSshKeys')}
                            </p>
                        </div>
                    ) : (
                        <div className='space-y-2'>
                            {user.sshKeys.map((key: AdminUserDetailSSHKey) => (
                                <Card key={key.id}>
                                    <CardContent className='py-3'>
                                        <div className='flex items-center justify-between gap-2'>
                                            <div className='flex min-w-0 items-center gap-3'>
                                                <div className='bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full'>
                                                    <KeyIcon className='text-muted-foreground h-4 w-4' />
                                                </div>
                                                <div className='min-w-0'>
                                                    <span className='truncate font-medium'>
                                                        {key.name}
                                                    </span>
                                                    <p className='text-muted-foreground truncate font-mono text-xs'>
                                                        {key.fingerprint}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className='text-muted-foreground shrink-0 text-xs'>
                                                {formatDate(key.createdAt)}
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                        <DatabaseIcon className='h-4 w-4' />
                        <h4 className='text-sm font-medium'>
                            {t('admin.volumes')}
                            {user.volumes.length > 0 &&
                                ` (${user.volumes.length})`}
                        </h4>
                    </div>
                    {user.volumes.length === 0 ? (
                        <div className='border-border rounded-lg border p-4 text-center'>
                            <p className='text-muted-foreground text-sm'>
                                {t('admin.noVolumes')}
                            </p>
                        </div>
                    ) : (
                        <div className='space-y-2'>
                            {user.volumes.map((vol: AdminUserDetailVolume) => (
                                <Card key={vol.id}>
                                    <CardContent className='py-3'>
                                        <div className='flex items-center justify-between gap-2'>
                                            <div className='min-w-0'>
                                                <span className='truncate font-medium'>
                                                    {vol.name}
                                                </span>
                                                <p className='text-muted-foreground truncate text-xs'>
                                                    {t('admin.unitGB', {
                                                        size: vol.size
                                                    })}{' '}
                                                    · {vol.location}
                                                </p>
                                            </div>
                                            <AdminStatusBadge
                                                status={vol.status}
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                        <ReceiptIcon className='h-4 w-4' />
                        <h4 className='text-sm font-medium'>
                            {t('admin.billing')}
                            {user.billingOrders.length > 0 &&
                                ` (${user.billingOrders.length})`}
                        </h4>
                    </div>
                    {user.billingOrders.length === 0 ? (
                        <div className='border-border rounded-lg border p-4 text-center'>
                            <p className='text-muted-foreground text-sm'>
                                {t('admin.noBilling')}
                            </p>
                        </div>
                    ) : (
                        <div className='space-y-2'>
                            {user.billingOrders.map((order: BillingOrder) => (
                                <Card key={order.id}>
                                    <CardContent className='py-3'>
                                        <div className='flex items-center justify-between gap-2'>
                                            <div className='min-w-0'>
                                                <span className='truncate font-medium'>
                                                    {order.productName ||
                                                        order.billingReason}
                                                </span>
                                                <p className='text-muted-foreground truncate text-xs'>
                                                    {formatDate(
                                                        order.createdAt
                                                    )}
                                                </p>
                                            </div>
                                            <div className='flex items-center gap-3'>
                                                <div className='text-right text-sm'>
                                                    <div className='flex items-center gap-2 font-medium'>
                                                        {order.discountAmount >
                                                            0 && (
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
                                                </div>
                                                <AdminStatusBadge
                                                    status={order.status}
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                <div className='flex justify-end gap-3 pt-2'>
                    <Button variant='outline' onClick={onClose}>
                        {t('common.close')}
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={updateMutation.isPending}
                    >
                        {updateMutation.isPending ? (
                            <CircleNotchIcon className='mr-1 h-4 w-4 animate-spin' />
                        ) : (
                            <FloppyDiskIcon className='mr-1 h-4 w-4' />
                        )}
                        {t('admin.saveUser')}
                    </Button>
                </div>
            </div>
        </Fragment>
    )
}

export default AdminUserDetailView