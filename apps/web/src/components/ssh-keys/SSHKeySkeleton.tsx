import type { FC, ReactNode } from 'react'

import { Card, CardContent, Skeleton } from '@/components/ui'

const SSHKeySkeleton: FC = (): ReactNode => {
    return (
        <Card>
            <CardContent className='py-4'>
                <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-4'>
                        <Skeleton className='h-10 w-10 rounded-full' />
                        <div className='space-y-2'>
                            <Skeleton className='h-5 w-32' />
                            <Skeleton className='h-4 w-48' />
                        </div>
                    </div>
                    <Skeleton className='h-8 w-8' />
                </div>
            </CardContent>
        </Card>
    )
}

export default SSHKeySkeleton