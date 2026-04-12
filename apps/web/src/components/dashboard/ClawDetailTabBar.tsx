import type { FC, ReactNode } from 'react'
import type { ClawDetailTabBarProps } from '@/ts/Interfaces'
import type { TranslationKey } from '@openclaw/i18n'

import { t } from '@openclaw/i18n'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { tabs } from '@/lib/clawDetailTabs'

const ClawDetailTabBar: FC<ClawDetailTabBarProps> = ({
    activeTab,
    fullScreen,
    isTabDisabled,
    getDisabledTooltip,
    setActiveTab
}): ReactNode => {
    return (
        <div
            className={`border-border flex flex-nowrap overflow-x-auto border-b`}
        >
            {tabs.map((tab) => {
                const disabled = isTabDisabled(tab.id)
                const tabButton = (
                    <button
                        key={tab.id}
                        onClick={() => !disabled && setActiveTab(tab.id)}
                        disabled={disabled}
                        className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${fullScreen ? 'flex-1' : ''} ${
                            disabled
                                ? 'text-muted-foreground/40 cursor-not-allowed border-transparent'
                                : activeTab === tab.id
                                  ? 'text-foreground border-[#ef5350]'
                                  : 'text-muted-foreground hover:text-foreground/80 border-transparent'
                        }`}
                    >
                        <tab.icon className='h-3.5 w-3.5' />
                        {t(tab.label as TranslationKey)}
                    </button>
                )
                if (disabled) {
                    return (
                        <Tooltip key={tab.id}>
                            <TooltipTrigger asChild>{tabButton}</TooltipTrigger>
                            <TooltipContent>
                                {getDisabledTooltip(tab.id)}
                            </TooltipContent>
                        </Tooltip>
                    )
                }
                return tabButton
            })}
        </div>
    )
}

export default ClawDetailTabBar