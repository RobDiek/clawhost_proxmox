import type { FC, ReactNode } from 'react'

import { Fragment } from 'react'

const PageBackground: FC = (): ReactNode => {
    return (
        <Fragment>
            <div className='landing-gradient pointer-events-none fixed inset-0' />
            <div className='landing-grid pointer-events-none absolute inset-0 h-screen' />
        </Fragment>
    )
}

export default PageBackground