import type { FC, ReactNode } from 'react'
import type { AgentDetailTabBarProps } from '@/ts/Interfaces'
import type { TranslationKey } from '@openclaw/i18n'

import { useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { tabs } from '@/lib/agentDetailTabs'

const AgentDetailTabBar: FC<AgentDetailTabBarProps> = ({
    activeTab,
    fullScreen,
    hiddenTabs,
    setActiveTab
}): ReactNode => {
    const visibleTabs = useMemo(() => {
        if (!hiddenTabs?.length) return tabs
        const hidden = new Set(hiddenTabs)
        return tabs.filter((tab) => !hidden.has(tab.id))
    }, [hiddenTabs])

    return (
        <div className='border-border flex select-none flex-nowrap overflow-x-auto border-b'>
            {visibleTabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${fullScreen ? 'flex-1' : ''} ${
                        activeTab === tab.id
                            ? 'text-foreground border-[#ef5350]'
                            : 'text-muted-foreground hover:text-foreground/80 border-transparent'
                    }`}
                >
                    <tab.icon className='h-3.5 w-3.5' />
                    {t(tab.label as TranslationKey)}
                </button>
            ))}
        </div>
    )
}

export default AgentDetailTabBar