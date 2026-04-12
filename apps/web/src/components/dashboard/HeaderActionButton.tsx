import type { FC, ReactNode } from 'react'
import type { HeaderActionButtonProps } from '@/ts/Interfaces'

import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'

const HeaderActionButton: FC<HeaderActionButtonProps> = ({
    icon: IconComponent,
    label,
    onClick,
    disabled
}): ReactNode => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={onClick}
                    disabled={disabled}
                    className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-lg p-1.5 transition-colors disabled:pointer-events-none disabled:cursor-default disabled:opacity-50'
                >
                    <IconComponent className='h-4 w-4' weight='bold' />
                </button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    )
}

export default HeaderActionButton