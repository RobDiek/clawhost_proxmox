import type { FC, ReactNode } from 'react'

const DashboardLoadingState: FC = (): ReactNode => {
    return (
        <div className='flex h-full flex-col items-center justify-center gap-5'>
            <div className='playground-loading-track bg-foreground/10 h-1 w-56 overflow-hidden rounded-full'>
                <div className='playground-loading-bar h-full rounded-full bg-gradient-to-r from-transparent via-[#ef5350] to-transparent' />
            </div>
        </div>
    )
}

export default DashboardLoadingState