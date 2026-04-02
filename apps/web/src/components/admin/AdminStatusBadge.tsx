import type { FC, ReactNode } from 'react'
import type { AdminStatusBadgeProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Badge } from '@/components/ui'

const AdminStatusBadge: FC<AdminStatusBadgeProps> = ({ status }): ReactNode => {
    switch (status) {
        case 'paid':
            return (
                <Badge className='pointer-events-none border-green-500/30 bg-green-500/20 text-green-600 dark:text-green-400'>
                    {t('billing.statusPaid')}
                </Badge>
            )
        case 'running':
            return (
                <Badge className='pointer-events-none border-green-500/30 bg-green-500/20 text-green-600 dark:text-green-400'>
                    {t('admin.statusRunning')}
                </Badge>
            )
        case 'stopped':
            return (
                <Badge className='pointer-events-none border-red-500/30 bg-red-500/20 text-red-600 dark:text-red-400'>
                    {t('admin.statusStopped')}
                </Badge>
            )
        default:
            return (
                <Badge variant='outline' className='pointer-events-none'>
                    {status}
                </Badge>
            )
    }
}

export default AdminStatusBadge