import type { ClawDetailTabConfig } from '@/ts/Interfaces'
import type { ClawDetailTab } from '@/ts/Types'

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
import { CLAW_DETAIL_TABS } from '@/lib/constants'

const tabs: ClawDetailTabConfig<ClawDetailTab>[] = [
    {
        id: CLAW_DETAIL_TABS.OVERVIEW,
        label: 'clawDetail.tabOverview',
        icon: GaugeIcon
    },
    {
        id: CLAW_DETAIL_TABS.PREVIEW,
        label: 'clawDetail.tabPreview',
        icon: BrowserIcon
    },
    {
        id: CLAW_DETAIL_TABS.TERMINAL,
        label: 'clawDetail.tabTerminal',
        icon: TerminalWindowIcon
    },
    {
        id: CLAW_DETAIL_TABS.LOGS,
        label: 'clawDetail.tabLogs',
        icon: ScrollIcon
    },
    {
        id: CLAW_DETAIL_TABS.VERSIONS,
        label: 'clawDetail.tabVersions',
        icon: TagIcon
    },
    {
        id: CLAW_DETAIL_TABS.FILES,
        label: 'clawDetail.tabFiles',
        icon: FolderSimpleIcon
    },
    {
        id: CLAW_DETAIL_TABS.MONITOR,
        label: 'clawDetail.tabMonitor',
        icon: ChartLineUpIcon
    },
    {
        id: CLAW_DETAIL_TABS.VOLUMES,
        label: 'clawDetail.tabVolumes',
        icon: DatabaseIcon
    },
    {
        id: CLAW_DETAIL_TABS.SERVER,
        label: 'clawDetail.tabServer',
        icon: HardDrivesIcon
    },
    {
        id: CLAW_DETAIL_TABS.SECURITY,
        label: 'clawDetail.tabSecurity',
        icon: ShieldCheckIcon
    },
    {
        id: CLAW_DETAIL_TABS.BILLING,
        label: 'clawDetail.tabBilling',
        icon: ReceiptIcon
    },
    {
        id: CLAW_DETAIL_TABS.SETTINGS,
        label: 'clawDetail.tabSettings',
        icon: GearSixIcon
    }
]

export default tabs