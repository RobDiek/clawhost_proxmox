import type { FC, ReactNode } from 'react'
import type { GoPricingCardProps } from '@/ts/Interfaces'

import { CheckIcon } from '@phosphor-icons/react'

const GoPricingCard: FC<GoPricingCardProps> = ({
    price,
    label,
    features
}): ReactNode => {
    return (
        <div className='border-border mx-auto max-w-2xl rounded-2xl border bg-gradient-to-b from-white/[0.03] to-transparent p-8'>
            <div className='flex flex-col items-center gap-8 md:flex-row md:items-start'>
                <div className='flex shrink-0 flex-col items-center md:items-start'>
                    <div className='font-clash mb-1 text-5xl font-bold'>
                        {price}
                    </div>
                    <span className='text-muted-foreground text-sm'>
                        {label}
                    </span>
                </div>

                <div className='border-border hidden w-px self-stretch bg-gradient-to-b from-transparent via-white/10 to-transparent md:block' />

                <div className='grid flex-1 grid-cols-2 gap-x-6 gap-y-3'>
                    {features.map((feature) => (
                        <div key={feature} className='flex items-center gap-2'>
                            <CheckIcon className='h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400' />
                            <span className='text-foreground/80 text-sm'>
                                {feature}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default GoPricingCard