import type { FC, ReactNode } from 'react'

import { Card, CardContent, Skeleton } from '@/components/ui'

const BillingSkeleton: FC = (): ReactNode => {
    return (
        <Card>
            <CardContent className='py-4'>
                <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-4'>
                        <div className='space-y-2'>
                            <Skeleton className='h-5 w-32' />
                            <Skeleton className='h-4 w-24' />
                        </div>
                    </div>
                    <div className='flex items-center gap-4'>
                        <Skeleton className='h-4 w-16' />
                        <Skeleton className='h-5 w-14 rounded-full' />
                        <Skeleton className='h-8 w-8' />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

export default BillingSkeleton