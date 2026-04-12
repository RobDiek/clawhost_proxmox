import type { FC, ReactNode } from 'react'

import { Skeleton } from '@/components/ui'

const BillingSkeleton: FC = (): ReactNode => {
    return (
        <div className='border-border bg-foreground/[0.02] flex items-center justify-between rounded-lg border px-3 py-2.5'>
            <div className='space-y-1.5'>
                <Skeleton className='h-4 w-32' />
                <Skeleton className='h-3 w-20' />
            </div>
            <div className='flex items-center gap-3'>
                <Skeleton className='h-4 w-14' />
                <Skeleton className='h-5 w-12 rounded-full' />
                <Skeleton className='h-7 w-7 rounded-md' />
            </div>
        </div>
    )
}

export default BillingSkeleton