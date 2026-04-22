import type { AgentDetailTabConfig } from '@/ts/Interfaces'
import type { AgentDetailTab } from '@/ts/Types'

import {
    ScrollIcon,
    GearSixIcon,
    TerminalWindowIcon,
    TagIcon,
    FolderSimpleIcon,
    ChartLineUpIcon,
    DatabaseIcon,
    BrowserIcon,
    ShieldCheckIcon,
    ReceiptIcon,
    HardDrivesIcon,
    GaugeIcon
} from '@phosphor-icons/react'
import { AGENT_DETAIL_TABS } from '@/lib/constants'

const tabs: AgentDetailTabConfig<AgentDetailTab>[] = [
    {
        id: AGENT_DETAIL_TABS.OVERVIEW,
        label: 'clawDetail.tabOverview',
        icon: GaugeIcon
    },
    {
        id: AGENT_DETAIL_TABS.PREVIEW,
        label: 'clawDetail.tabPreview',
        icon: BrowserIcon
    },
    {
        id: AGENT_DETAIL_TABS.TERMINAL,
        label: 'clawDetail.tabTerminal',
        icon: TerminalWindowIcon
    },
    {
        id: AGENT_DETAIL_TABS.LOGS,
        label: 'clawDetail.tabLogs',
        icon: ScrollIcon
    },
    {
        id: AGENT_DETAIL_TABS.VERSIONS,
        label: 'clawDetail.tabVersions',
        icon: TagIcon
    },
    {
        id: AGENT_DETAIL_TABS.FILES,
        label: 'clawDetail.tabFiles',
        icon: FolderSimpleIcon
    },
    {
        id: AGENT_DETAIL_TABS.MONITOR,
        label: 'clawDetail.tabMonitor',
        icon: ChartLineUpIcon
    },
    {
        id: AGENT_DETAIL_TABS.VOLUMES,
        label: 'clawDetail.tabVolumes',
        icon: DatabaseIcon
    },
    {
        id: AGENT_DETAIL_TABS.SERVER,
        label: 'clawDetail.tabServer',
        icon: HardDrivesIcon
    },
    {
        id: AGENT_DETAIL_TABS.SECURITY,
        label: 'clawDetail.tabSecurity',
        icon: ShieldCheckIcon
    },
    {
        id: AGENT_DETAIL_TABS.BILLING,
        label: 'clawDetail.tabBilling',
        icon: ReceiptIcon
    },
    {
        id: AGENT_DETAIL_TABS.SETTINGS,
        label: 'clawDetail.tabSettings',
        icon: GearSixIcon
    }
]

export default tabs