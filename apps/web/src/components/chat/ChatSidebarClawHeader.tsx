import type { FC, ReactNode } from 'react'
import type { ChatSidebarClawHeaderProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { clawStatus } from '@openclaw/shared'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { getBaseDomain, TRUNCATE_LENGTHS } from '@/lib'
import { generateSlug } from '@/lib/claw-utils'
import { CLAW_AVATAR_SIZE } from '@/lib/constants'
import { ClawAvatar } from '@/components/shared'
import { usePreferencesStore } from '@/lib/store'

const ChatSidebarClawHeader: FC<ChatSidebarClawHeaderProps> = ({
    claw,
    isSelected,
    statusConfig,
    onOpenClawSettings
}): ReactNode => {
    const adminMode = usePreferencesStore((s) => s.adminMode)

    return (
        <Fragment>
            <div
                onClick={() => onOpenClawSettings(claw.id)}
                className={`group/header relative mb-1.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isSelected ? 'bg-foreground/10' : 'hover:bg-foreground/5'
                }`}
            >
                <div className='relative shrink-0'>
                    <ClawAvatar emoji={claw.emoji} emojiColor={claw.emojiColor} size={CLAW_AVATAR_SIZE.SM} />
                    {adminMode && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className='border-background absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2'>
                                    <div
                                        className={`h-2 w-2 rounded-full ${statusConfig.color} ${statusConfig.pulse ? 'animate-pulse' : 'status-dot-alive'}`}
                                    />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side='bottom'>
                                <p>{statusConfig.label}</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
                <div className='min-w-0 flex-1'>
                    {claw.name.length > TRUNCATE_LENGTHS.SIDEBAR_CLAW_NAME ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className='text-foreground truncate text-[13px] font-medium'>
                                    {claw.name.slice(
                                        0,
                                        TRUNCATE_LENGTHS.SIDEBAR_CLAW_NAME
                                    )}
                                    ...
                                </p>
                            </TooltipTrigger>
                            <TooltipContent>{claw.name}</TooltipContent>
                        </Tooltip>
                    ) : (
                        <p className='text-foreground truncate text-[13px] font-medium'>
                            {claw.name}
                        </p>
                    )}
                </div>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                if (claw.status !== clawStatus.running) return
                                const subdomain = claw.subdomain || generateSlug(claw.id)
                                const url = `https://${subdomain}.${getBaseDomain()}${claw.gatewayToken ? `/?token=${claw.gatewayToken}` : ''}`
                                window.open(url, '_blank')
                            }}
                            disabled={claw.status !== clawStatus.running}
                            className='text-muted-foreground shrink-0 rounded-md p-1 transition-colors disabled:pointer-events-none disabled:opacity-30 hover:bg-foreground/10 hover:text-foreground'
                        >
                            <ArrowSquareOutIcon className='h-3.5 w-3.5' />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side='bottom'>
                        {t('dashboard.openControlPanel')}
                    </TooltipContent>
                </Tooltip>
            </div>
        </Fragment>
    )
}

export default ChatSidebarClawHeader