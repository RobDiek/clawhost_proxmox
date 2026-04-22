import type { FC, ReactNode } from 'react'
import type { SecuritySectionProps } from '@/ts/Interfaces'

const SecuritySection: FC<SecuritySectionProps> = ({
    title,
    icon,
    children
}): ReactNode => (
    <div className='border-border rounded-lg border p-4'>
        <div className='mb-3 flex items-center gap-2'>
            {icon}
            <h4 className='text-sm font-medium'>{title}</h4>
        </div>
        {children}
    </div>
)

export default SecuritySection