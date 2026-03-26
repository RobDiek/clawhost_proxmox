import type { FC, ReactNode } from 'react'
import type { PanelPlaceholderProps } from '@/ts/Interfaces'

const PanelPlaceholder: FC<PanelPlaceholderProps> = ({
    icon,
    title,
    description
}): ReactNode => {
    return (
        <div className='flex h-full flex-col items-center justify-center gap-3 px-14 pb-16'>
            <div className='bg-foreground/5 flex h-12 w-12 items-center justify-center rounded-xl'>
                {icon}
            </div>
            <div className='text-center'>
                <p className='text-foreground/80 text-sm font-medium'>
                    {title}
                </p>
                <p className='text-muted-foreground mt-1 text-xs'>
                    {description}
                </p>
            </div>
        </div>
    )
}

export default PanelPlaceholder