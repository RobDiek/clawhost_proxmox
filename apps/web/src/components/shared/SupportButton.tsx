import type { FC, ReactNode } from 'react'
import type { SupportButtonProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { EnvelopeSimpleIcon } from '@phosphor-icons/react'
import {
    Button,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui'
import { SUPPORT_EMAIL } from '@/lib/links'

const SupportButton: FC<SupportButtonProps> = ({
    showLabel = false
}): ReactNode => {
    const label = t('dashboard.contactSupport')

    const button = (
        <Button
            variant='ghost'
            size={showLabel ? 'sm' : 'icon'}
            className='text-muted-foreground hover:text-foreground'
            asChild
        >
            <a href={`mailto:${SUPPORT_EMAIL}`}>
                <EnvelopeSimpleIcon className='h-4 w-4' />
                {showLabel && label}
            </a>
        </Button>
    )

    if (showLabel) return button

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

export default SupportButton