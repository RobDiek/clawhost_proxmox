import type { PlaygroundTabConfig } from '@/ts/Interfaces'
import type { PlaygroundDetailTab } from '@/ts/Types'

import {
    InfoIcon,
    ScrollIcon,
    PulseIcon,
    KeyIcon,
    LightningIcon,
    GearSixIcon,
    TerminalWindowIcon,
    ChatsCircleIcon
} from '@phosphor-icons/react'
import { CLAW_DETAIL_TABS } from '@/lib/constants'
import { ClawMascotOutline } from '@/components/shared'

const tabs: PlaygroundTabConfig<PlaygroundDetailTab>[] = [
    { id: CLAW_DETAIL_TABS.INFO, label: 'playground.tabInfo', icon: InfoIcon },
    {
        id: CLAW_DETAIL_TABS.CHANNELS,
        label: 'playground.tabChannels',
        icon: ChatsCircleIcon
    },
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
        id: CLAW_DETAIL_TABS.VARIABLES,
        label: 'playground.tabEnvs',
        icon: KeyIcon
    },
    {
        id: CLAW_DETAIL_TABS.SKILLS,
        label: 'playground.tabSkills',
        icon: LightningIcon
    },
    {
        id: CLAW_DETAIL_TABS.VERSIONS,
        label: 'playground.tabVersions',
        icon: ClawMascotOutline
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