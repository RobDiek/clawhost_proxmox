import type { FC, ReactNode } from 'react'
import type { AdminUserRowProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { getLocale } from '@/lib'
import { Card, CardContent, Badge } from '@/components/ui'
import { userRole } from '@openclaw/shared'
import {
    UserIcon,
    ShieldCheckIcon,
    HardDrivesIcon,
    KeyIcon
} from '@phosphor-icons/react'

const AdminUserRow: FC<AdminUserRowProps> = ({ user, onSelect }): ReactNode => {
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString(getLocale(), {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }

    return (
        <Card
            className='hover:bg-foreground/10 cursor-pointer transition-colors'
            onClick={() => onSelect(user.id)}
        >
            <CardContent className='py-4'>
                <div className='flex items-center justify-between'>
                    <div className='flex min-w-0 items-center gap-3'>
                        <div className='bg-primary/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full'>
                            <UserIcon className='text-primary h-4 w-4' />
                        </div>
                        <div className='min-w-0'>
                            <div className='flex items-center gap-2'>
                                <span className='truncate font-medium'>
                                    {user.name || user.email}
                                </span>
                                {user.role === userRole.admin && (
                                    <Badge className='pointer-events-none border-purple-500/30 bg-purple-500/20 text-purple-600 dark:text-purple-400'>
                                        <ShieldCheckIcon className='mr-1 h-3 w-3' />
                                        {t('admin.adminBadge')}
                                    </Badge>
                                )}
                                {user.hasLicense && (
                                    <Badge className='pointer-events-none border-green-500/30 bg-green-500/20 text-green-600 dark:text-green-400'>
                                        {t('admin.license')}
                                    </Badge>
                                )}
                            </div>
                            <p className='text-muted-foreground truncate text-sm'>
                                {user.name
                                    ? user.email
                                    : formatDate(user.createdAt)}
                            </p>
                        </div>
                    </div>
                    <div className='hidden items-center gap-4 sm:flex'>
                        <div className='text-muted-foreground flex items-center gap-1 text-sm'>
                            <HardDrivesIcon className='h-4 w-4' />
                            <span>{user.clawCount}</span>
                        </div>
                        <div className='text-muted-foreground flex items-center gap-1 text-sm'>
                            <KeyIcon className='h-4 w-4' />
                            <span>{user.sshKeyCount}</span>
                        </div>
                        <span className='text-muted-foreground text-sm'>
                            {formatDate(user.createdAt)}
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

export default AdminUserRow