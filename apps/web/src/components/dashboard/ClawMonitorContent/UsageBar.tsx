import type { FC, ReactNode } from 'react'
import type { UsageBarProps } from '@/ts/Interfaces'

const UsageBar: FC<UsageBarProps> = ({ value, color, label, detail }): ReactNode => (
    <div className='space-y-1.5'>
        <div className='flex items-center justify-between text-xs'>
            <span className='text-foreground font-medium'>{label}</span>
            <span className='text-muted-foreground'>{detail}</span>
        </div>
        <div className='bg-muted h-2.5 w-full overflow-hidden rounded-full'>
            <div
                className='h-full rounded-full transition-all duration-500'
                style={{
                    width: `${Math.min(value, 100)}%`,
                    backgroundColor: color
                }}
            />
        </div>
    </div>
)

export default UsageBar