import type { FC, ReactNode } from 'react'
import type { LandingCTAProps } from '@/ts/Interfaces'

const LandingCTA: FC<LandingCTAProps> = ({
    title,
    description,
    children
}): ReactNode => {
    return (
        <section className='border-border relative border-t px-6 py-32'>
            <div className='mx-auto max-w-4xl text-center'>
                <div className='border-border/50 rounded-2xl border bg-gradient-to-b from-white/[0.03] to-transparent px-6 py-12'>
                    <h2 className='font-clash mb-4 text-3xl font-bold'>
                        {title}
                    </h2>
                    <p className='text-muted-foreground mx-auto mb-8 max-w-xl text-base'>
                        {description}
                    </p>
                    <div className='flex flex-col items-center justify-center gap-4 sm:flex-row'>
                        {children}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default LandingCTA