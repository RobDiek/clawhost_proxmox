import type { PlaygroundTabConfig } from '@/ts/Interfaces'
import type { PlaygroundDetailTab } from '@/ts/Types'

import {
    InfoIcon,
    ScrollIcon,
    PulseIcon,
    GearSixIcon,
    TerminalWindowIcon,
    TagIcon,
    FolderSimpleIcon
} from '@phosphor-icons/react'
import { CLAW_DETAIL_TABS } from '@/lib/constants'

const tabs: PlaygroundTabConfig<PlaygroundDetailTab>[] = [
    { id: CLAW_DETAIL_TABS.INFO, label: 'playground.tabInfo', icon: InfoIcon },
    {
        id: CLAW_DETAIL_TABS.TERMINAL,
        label: 'playground.tabTerminal',
        icon: TerminalWindowIcon
    },
    {
        id: CLAW_DETAIL_TABS.LOGS,
        label: 'playground.tabLogs',
        icon: ScrollIcon
    },
    {
        id: CLAW_DETAIL_TABS.VERSIONS,
        label: 'playground.tabVersions',
        icon: TagIcon
    },
    {
        id: CLAW_DETAIL_TABS.FILES,
        label: 'playground.tabFiles',
        icon: FolderSimpleIcon
    },
    {
        id: CLAW_DETAIL_TABS.DIAGNOSTICS,
        label: 'playground.tabDiagnostics',
        icon: PulseIcon
    },
    {
        id: CLAW_DETAIL_TABS.SETTINGS,
        label: 'playground.tabSettings',
        icon: GearSixIcon
    }
]

export default tabs