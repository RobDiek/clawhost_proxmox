import type { FC, ReactNode } from 'react'

const PageBackground: FC = (): ReactNode => {
    return (
        <>
            <div className='landing-gradient pointer-events-none fixed inset-0' />
            <div className='landing-grid pointer-events-none absolute inset-0 h-screen' />
        </>
    )
}

export default PageBackground