import type { FC, ReactNode } from 'react'
import type { StatsRowProps } from '@/ts/Interfaces'

const StatsRow: FC<StatsRowProps> = ({ stats }): ReactNode => {
    return (
        <div className='grid grid-cols-2 gap-6 text-center md:flex md:items-center md:gap-16'>
            {stats.map((stat, index) => (
                <div key={stat.label} className='contents'>
                    {index > 0 && (
                        <div className='bg-foreground/10 hidden h-12 w-px md:block' />
                    )}
                    <div>
                        <div className='font-clash text-foreground text-3xl font-bold md:text-4xl'>
                            {stat.value}
                        </div>
                        <div className='text-muted-foreground text-sm'>
                            {stat.label}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

export default StatsRow