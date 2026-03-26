import type { FC, ReactNode } from 'react'

const TrustMrrBadge: FC = (): ReactNode => {
    return (
        <a href='https://trustmrr.com/startup/clawhost' target='_blank'>
            <img
                src='https://trustmrr.com/api/embed/clawhost?format=svg&theme=light'
                alt='TrustMRR verified revenue badge'
                width='171'
                height='70'
                className='block dark:hidden'
            />
            <img
                src='https://trustmrr.com/api/embed/clawhost?format=svg&theme=dark'
                alt='TrustMRR verified revenue badge'
                width='171'
                height='70'
                className='hidden dark:block'
            />
        </a>
    )
}

export default TrustMrrBadge