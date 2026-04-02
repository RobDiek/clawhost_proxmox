import type { FC, ReactNode } from 'react'
import type { AdminDetailFieldProps } from '@/ts/Interfaces'

const AdminDetailField: FC<AdminDetailFieldProps> = ({
    label,
    value,
    className
}): ReactNode => {
    return (
        <div className={className ? `space-y-1 ${className}` : 'space-y-1'}>
            <p className='text-muted-foreground text-xs'>{label}</p>
            <div className='text-sm'>{value}</div>
        </div>
    )
}

export default AdminDetailField