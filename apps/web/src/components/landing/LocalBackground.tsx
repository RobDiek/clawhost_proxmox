import type { FC, ReactNode } from 'react'

const LocalBackground: FC = (): ReactNode => {
    return (
        <>
            <div className='playground-grid pointer-events-none fixed inset-0 opacity-50' />
            <div className='playground-gradient pointer-events-none fixed inset-0 opacity-30' />
        </>
    )
}

export default LocalBackground