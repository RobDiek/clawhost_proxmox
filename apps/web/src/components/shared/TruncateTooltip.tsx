import type { FC, ReactNode } from 'react'
import type { TruncateTooltipProps } from '@/ts/Interfaces'

import { useRef, useState, useCallback } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'

const TruncateTooltip: FC<TruncateTooltipProps> = ({
    content,
    children
}): ReactNode => {
    const [open, setOpen] = useState(false)
    const triggerRef = useRef<HTMLDivElement>(null)

    const handleOpenChange = useCallback((next: boolean) => {
        if (next && triggerRef.current) {
            const el = triggerRef.current
                .firstElementChild as HTMLElement | null
            if (el && el.scrollWidth > el.clientWidth) {
                setOpen(true)
                return
            }
            setOpen(false)
            return
        }
        setOpen(next)
    }, [])

    return (
        <Tooltip open={open} onOpenChange={handleOpenChange}>
            <TooltipTrigger asChild>
                <div ref={triggerRef} className='min-w-0'>
                    {children}
                </div>
            </TooltipTrigger>
            <TooltipContent side='top'>{content}</TooltipContent>
        </Tooltip>
    )
}

export default TruncateTooltip