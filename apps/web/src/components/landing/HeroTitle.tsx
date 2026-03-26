import type { FC, ReactNode } from 'react'
import type { HeroTitleProps } from '@/ts/Interfaces'

import { Fragment } from 'react'

const HeroTitle: FC<HeroTitleProps> = ({
    line1,
    line2,
    description
}): ReactNode => {
    return (
        <Fragment>
            <h1 className='font-clash mb-6 text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl lg:text-8xl'>
                <span className='from-foreground via-foreground to-muted-foreground bg-gradient-to-b bg-clip-text text-transparent'>
                    {line1}
                </span>
                <br />
                <span className='animate-gradient bg-gradient-to-r from-[#ef5350] via-[#ff7043] to-[#ffab91] bg-clip-text text-transparent'>
                    {line2}
                </span>
            </h1>

            <p className='text-muted-foreground mb-10 max-w-2xl text-lg leading-relaxed md:text-xl'>
                {description}
            </p>
        </Fragment>
    )
}

export default HeroTitle