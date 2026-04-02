import type { FC, ReactNode } from 'react'

import { Card, CardContent, Skeleton } from '@/components/ui'

const AdminUserSkeleton: FC = (): ReactNode => {
    return (
        <Card>
            <CardContent className='py-4'>
                <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-4'>
                        <Skeleton className='h-9 w-9 rounded-full' />
                        <div className='space-y-2'>
                            <Skeleton className='h-4 w-40' />
                            <Skeleton className='h-3 w-24' />
                        </div>
                    </div>
                    <div className='hidden items-center gap-4 sm:flex'>
                        <Skeleton className='h-4 w-16' />
                        <Skeleton className='h-5 w-14 rounded-full' />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

export default AdminUserSkeleton