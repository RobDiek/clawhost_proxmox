import { t } from '@openclaw/i18n'
import {
    CubeIcon,
    GlobeIcon,
    ShieldCheckIcon,
    CreditCardIcon,
    ClockIcon,
    LockIcon,
    GaugeIcon,
    LinkIcon,
    SlidersHorizontalIcon,
    StackIcon,
    GitBranchIcon,
    TerminalIcon
} from '@phosphor-icons/react'

const getV2Features = () => [
    { icon: CubeIcon, title: t('v2.feature1Title'), description: t('v2.feature1Description') },
    { icon: ClockIcon, title: t('landing.zeroConfig'), description: t('v2.zeroConfigDescription') },
    { icon: LockIcon, title: t('landing.ownedData'), description: t('landing.ownedDataDescription') },
    { icon: GaugeIcon, title: t('landing.fullSpeed'), description: t('landing.fullSpeedDescription') },
    { icon: GlobeIcon, title: t('landing.globalLocations'), description: t('v2.globalLocationsDescription') },
    { icon: TerminalIcon, title: t('landing.fullSshAccess'), description: t('landing.fullSshAccessDescription') },
    { icon: CreditCardIcon, title: t('landing.payAsYouGo'), description: t('landing.payAsYouGoDescription') },
    { icon: LinkIcon, title: t('landing.customSubdomains'), description: t('v2.onlineAccessDescription') },
    { icon: ShieldCheckIcon, title: t('landing.secure'), description: t('landing.secureDescription') },
    { icon: GitBranchIcon, title: t('landing.autoUpdates'), description: t('v2.versionControlDescription') },
    { icon: SlidersHorizontalIcon, title: t('v2.agentControlTitle'), description: t('v2.agentControlDescription') },
    { icon: StackIcon, title: t('v2.multipleAgentsTitle'), description: t('v2.multipleAgentsDescription') }
]

export default getV2Features