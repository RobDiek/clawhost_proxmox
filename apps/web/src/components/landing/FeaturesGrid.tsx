import type { FC, ReactNode } from 'react'
import type { FeaturesGridProps } from '@/ts/Interfaces'

import { Badge } from '@/components/ui'

const FeaturesGrid: FC<FeaturesGridProps> = ({
    badge,
    heading,
    description,
    features
}): ReactNode => {
    return (
        <section
            id='features'
            className='cv-auto border-border relative scroll-mt-24 border-t px-6 py-24'
        >
            <div className='mx-auto max-w-6xl'>
                <div className='mb-16 text-center'>
                    <Badge
                        variant='outline'
                        className='border-border bg-foreground/5 text-foreground/80 mb-4'
                    >
                        {badge}
                    </Badge>
                    <h2 className='font-clash from-foreground to-muted-foreground mb-4 bg-gradient-to-b bg-clip-text text-4xl font-bold text-transparent md:text-5xl'>
                        {heading}
                    </h2>
                    <p className='text-muted-foreground mx-auto max-w-xl text-lg'>
                        {description}
                    </p>
                </div>

                <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
                    {features.map((feature, i) => (
                        <div
                            key={i}
                            className='border-border bg-foreground/[0.02] rounded-xl border p-6'
                        >
                            <feature.icon className='mb-4 h-8 w-8 text-[#ef5350]' />
                            <h3 className='font-clash text-foreground mb-2 text-lg font-semibold'>
                                {feature.title}
                            </h3>
                            <p className='text-muted-foreground text-sm leading-relaxed'>
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default FeaturesGrid