import type { FC, ReactNode } from 'react'
import type { AdminOwnerLinkProps } from '@/ts/Interfaces'

import { UserIcon } from '@phosphor-icons/react'

const AdminOwnerLink: FC<AdminOwnerLinkProps> = ({
    userId,
    email,
    onNavigateToUser
}): ReactNode => {
    return (
        <button
            onClick={() => onNavigateToUser(userId)}
            className='text-primary flex items-center gap-1 truncate text-sm hover:underline'
        >
            <UserIcon className='h-3 w-3' />
            {email || userId}
        </button>
    )
}

export default AdminOwnerLink