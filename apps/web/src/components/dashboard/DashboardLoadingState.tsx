import type { FC, ReactNode } from 'react'

import { CircleNotchIcon } from '@phosphor-icons/react'

const DashboardLoadingState: FC = (): ReactNode => {
    return (
        <div className='flex h-full flex-col items-center justify-center'>
            <CircleNotchIcon className='text-foreground/50 h-7 w-7 animate-spin' />
        </div>
    )
}

export default DashboardLoadingState