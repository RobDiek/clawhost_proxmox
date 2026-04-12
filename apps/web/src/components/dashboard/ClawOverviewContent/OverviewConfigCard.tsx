import type { FC, ReactNode } from 'react'
import type { OverviewConfigCardProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    GearSixIcon,
    BrowserIcon,
    TerminalWindowIcon,
    WrenchIcon,
    CheckIcon,
    XIcon
} from '@phosphor-icons/react'

const OverviewConfigCard: FC<OverviewConfigCardProps> = ({
    config
}): ReactNode => {
    if (!config) return null

    return (
        <div className='border-border rounded-lg border p-4'>
            <div className='mb-3 flex items-center gap-2'>
                <GearSixIcon className='h-4 w-4 text-purple-500' />
                <h4 className='text-sm font-medium'>
                    {t('clawDetail.overviewConfiguration')}
                </h4>
            </div>
            <div className='space-y-2'>
                <div className='bg-foreground/5 flex items-center justify-between rounded-lg px-3 py-2'>
                    <span className='flex items-center gap-2 text-sm'>
                        <BrowserIcon className='h-3.5 w-3.5' />
                        {t('clawDetail.overviewBrowser')}
                    </span>
                    {config.browserEnabled ? (
                        <CheckIcon className='h-4 w-4 text-green-500' />
                    ) : (
                        <XIcon className='h-4 w-4 text-red-500' />
                    )}
                </div>
                <div className='bg-foreground/5 flex items-center justify-between rounded-lg px-3 py-2'>
                    <span className='flex items-center gap-2 text-sm'>
                        <TerminalWindowIcon className='h-3.5 w-3.5' />
                        {t('clawDetail.overviewCommands')}
                    </span>
                    {config.commandsEnabled ? (
                        <CheckIcon className='h-4 w-4 text-green-500' />
                    ) : (
                        <XIcon className='h-4 w-4 text-red-500' />
                    )}
                </div>
                {config.tools.length > 0 && (
                    <div className='bg-foreground/5 rounded-lg px-3 py-2'>
                        <span className='text-muted-foreground mb-1.5 flex items-center gap-2 text-xs'>
                            <WrenchIcon className='h-3 w-3' />
                            {t('clawDetail.overviewTools')}
                        </span>
                        <div className='flex flex-wrap gap-1'>
                            {config.tools.map((name) => (
                                <span
                                    key={name}
                                    className='bg-foreground/10 rounded px-1.5 py-0.5 font-mono text-xs'
                                >
                                    {name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default OverviewConfigCard