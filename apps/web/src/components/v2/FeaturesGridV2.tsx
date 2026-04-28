import type { FC, ReactNode } from 'react'
import type { FeaturesGridProps } from '@/ts/Interfaces'

import SectionLabelV2 from '@/components/v2/SectionLabelV2'

const FeaturesGridV2: FC<FeaturesGridProps> = ({
    badge,
    heading,
    description,
    features
}): ReactNode => {
    return (
        <section
            id='features'
            className='v2-section scroll-mt-24 border-t border-white/5 px-6 py-24'
        >
            <div className='mx-auto max-w-6xl'>
                <div className='mb-16'>
                    <SectionLabelV2 label={badge} />
                    <h2 className='font-syne mb-4 text-4xl font-extrabold uppercase tracking-tight text-white md:text-5xl'>
                        {heading}
                    </h2>
                    <p className='max-w-xl font-mono text-sm leading-relaxed text-white/40'>
                        {description}
                    </p>
                </div>

                <div className='grid border border-white/10 md:grid-cols-2 lg:grid-cols-3'>
                    {features.map((feature, i) => (
                        <div
                            key={i}
                            className='border-b border-r border-white/10 bg-white/[0.02] p-6'
                        >
                            <feature.icon
                                className='mb-4 h-6 w-6 text-[#6B5CE7]'
                                weight='duotone'
                            />
                            <h3 className='font-syne mb-2 text-sm font-bold uppercase tracking-wider text-white/80'>
                                {feature.title}
                            </h3>
                            <p className='font-mono text-xs leading-relaxed text-white/40'>
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default FeaturesGridV2