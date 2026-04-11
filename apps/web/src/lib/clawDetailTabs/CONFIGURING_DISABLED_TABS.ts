import type { ClawDetailTab } from '@/ts/Types'

import { CLAW_DETAIL_TABS } from '@/lib/constants'

const CONFIGURING_DISABLED_TABS: ClawDetailTab[] = [
    CLAW_DETAIL_TABS.VERSIONS,
    CLAW_DETAIL_TABS.FILES,
    CLAW_DETAIL_TABS.LOGS,
    CLAW_DETAIL_TABS.DIAGNOSTICS,
    CLAW_DETAIL_TABS.TERMINAL
]

export default CONFIGURING_DISABLED_TABS