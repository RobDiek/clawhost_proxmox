import type { FC, ReactNode } from 'react'
import type { MetricCardProps } from '@/ts/Interfaces'

const MetricCard: FC<MetricCardProps> = ({
    title,
    icon,
    children
}): ReactNode => (
    <div className='border-border rounded-lg border p-4'>
        <div className='mb-3 flex items-center gap-2'>
            {icon}
            <h4 className='text-sm font-medium'>{title}</h4>
        </div>
        {children}
    </div>
)

export default MetricCard