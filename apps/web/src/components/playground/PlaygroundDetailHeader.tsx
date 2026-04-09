import type { FC, ReactNode } from 'react'
import type { PlaygroundDetailHeaderProps } from '@/ts/Interfaces'

import { XIcon, ArrowSquareOutIcon } from '@phosphor-icons/react'
import { clawStatus } from '@openclaw/shared'
import { getBaseDomain, TRUNCATE_LENGTHS } from '@/lib'
import { generateSlug } from '@/lib/claw-utils'
import { ClawAvatar } from '@/components/shared'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'

const PlaygroundDetailHeader: FC<PlaygroundDetailHeaderProps> = ({
    claw,
    onClose,
    fullScreen
}): ReactNode => {
    return (
        <div className='border-border flex items-center justify-between border-b px-5 py-2.5'>
            <div className='flex items-center gap-2.5'>
                <ClawAvatar />
                <div className='space-y-px'>
                    <h3 className='text-foreground text-sm font-semibold leading-tight'>
                        {claw.name.length > TRUNCATE_LENGTHS.PANEL_NAME ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span>
                                        {claw.name.slice(
                                            0,
                                            TRUNCATE_LENGTHS.PANEL_NAME
                                        )}
                                        ...
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>{claw.name}</TooltipContent>
                            </Tooltip>
                        ) : (
                            <span>{claw.name}</span>
                        )}
                    </h3>
                    {claw.status !== clawStatus.configuring &&
                        claw.status !== clawStatus.awaitingPayment && (
                            <a
                                href={`https://${claw.subdomain || generateSlug(claw.id)}.${getBaseDomain()}${claw.gatewayToken ? `/?token=${claw.gatewayToken}` : ''}`}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='text-muted-foreground hover:text-foreground/80 flex items-center gap-1 truncate text-xs leading-tight transition-colors'
                            >
                                <ArrowSquareOutIcon className='h-3 w-3 shrink-0' />
                                {claw.subdomain || generateSlug(claw.id)}.
                                {getBaseDomain()}
                            </a>
                        )}
                </div>
            </div>
            <button
                onClick={onClose}
                className={`text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-lg p-1.5 transition-colors ${fullScreen ? 'md:hidden' : ''}`}
            >
                <XIcon className='h-4 w-4' weight='bold' />
            </button>
        </div>
    )
}

export default PlaygroundDetailHeader