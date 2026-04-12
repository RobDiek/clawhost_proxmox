import type { FC, ReactNode } from 'react'
import type {
    AdminUserClawsSectionProps,
    AdminUserDetailClaw
} from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Card, CardContent } from '@/components/ui'
import { HardDrivesIcon } from '@phosphor-icons/react'
import AdminStatusBadge from '@/components/admin/AdminStatusBadge'

const AdminUserClawsSection: FC<AdminUserClawsSectionProps> = ({
    claws
}): ReactNode => (
    <div className='space-y-3'>
        <div className='flex items-center gap-2'>
            <HardDrivesIcon className='h-4 w-4' />
            <h4 className='text-sm font-medium'>
                {t('admin.claws')}
                {claws.length > 0 && ` (${claws.length})`}
            </h4>
        </div>
        {claws.length === 0 ? (
            <div className='border-border rounded-lg border p-4 text-center'>
                <p className='text-muted-foreground text-sm'>
                    {t('admin.noClaws')}
                </p>
            </div>
        ) : (
            <div className='space-y-2'>
                {claws.map((claw: AdminUserDetailClaw) => (
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
                                            {claw.ip || t('admin.notSet')} ·{' '}
                                            {claw.planId} ·{' '}
                                            {claw.location || t('admin.notSet')}
                                        </p>
                                    </div>
                                </div>
                                <AdminStatusBadge status={claw.status} />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        )}
    </div>
)

export default AdminUserClawsSection