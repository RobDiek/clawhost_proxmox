import type { FC, ReactNode } from 'react'
import type { ClawDetailTabBarProps } from '@/ts/Interfaces'
import type { ClawDetailTab } from '@/ts/Types'
import type { TranslationKey } from '@openclaw/i18n'

import { useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { tabs } from '@/lib/clawDetailTabs'
import { CLAW_DETAIL_TABS } from '@/lib/constants'

const DEMO_TABS: Set<ClawDetailTab> = new Set([
    CLAW_DETAIL_TABS.OVERVIEW,
    CLAW_DETAIL_TABS.LOGS,
    CLAW_DETAIL_TABS.SERVER,
    CLAW_DETAIL_TABS.VOLUMES,
    CLAW_DETAIL_TABS.SETTINGS
])

const ClawDetailTabBar: FC<ClawDetailTabBarProps> = ({
    activeTab,
    fullScreen,
    readOnly,
    isTabDisabled,
    getDisabledTooltip,
    setActiveTab
}): ReactNode => {
    const visibleTabs = useMemo(
        () => (readOnly ? tabs.filter((tab) => DEMO_TABS.has(tab.id)) : tabs),
        [readOnly]
    )

    return (
        <div
            className='border-border flex select-none flex-nowrap overflow-x-auto border-b'
        >
            {visibleTabs.map((tab) => {
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