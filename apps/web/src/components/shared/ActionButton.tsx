import type { FC, ReactNode } from 'react'
import type { ActionButtonProps } from '@/ts/Interfaces'

import { Button } from '@/components/ui'

const ActionButton: FC<ActionButtonProps> = ({
    onClick,
    label,
    icon,
    size = 'default'
}): ReactNode => {
    return (
        <Button
            onClick={onClick}
            size={size}
            className='border-border bg-foreground text-background hover:bg-foreground/90 gap-2 border'
        >
            {icon}
            {label}
        </Button>
    )
}

export default ActionButton