import type { FC, ReactNode } from 'react'
import type { SectionHeaderProps } from '@/ts/Interfaces'

const SectionHeader: FC<SectionHeaderProps> = ({
    title,
    action
}): ReactNode => {
    return (
        <div className='flex items-center justify-between'>
            <h3 className='text-sm font-medium'>{title}</h3>
            {action}
        </div>
    )
}

export default SectionHeader