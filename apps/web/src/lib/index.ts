import api from '@/lib/api'
import cn from '@/lib/utils'
import PATHS from '@/lib/paths'
import {
    AGENT_DETAIL_TABS,
    CLAW_DETAIL_TABS,
    DASHBOARD_TABS,
    LANGUAGES,
    RELEASES,
    ROUTES,
    SCROLL_SECTIONS,
    THEMES
} from '@/lib/constants'
import getBaseDomain from '@/lib/getBaseDomain'
import getLocale from '@/lib/getLocale'
import TRUNCATE_LENGTHS from '@/lib/truncateLengths'
import fireConfetti from '@/lib/fireConfetti'
import copyToClipboard from '@/lib/copyToClipboard'
import reportWebVitals from '@/lib/reportWebVitals'

export {
    api,
    cn,
    PATHS,
    ROUTES,
    SCROLL_SECTIONS,
    DASHBOARD_TABS,
    AGENT_DETAIL_TABS,
    CLAW_DETAIL_TABS,
    THEMES,
    LANGUAGES,
    RELEASES,
    getBaseDomain,
    getLocale,
    TRUNCATE_LENGTHS,
    fireConfetti,
    copyToClipboard,
    reportWebVitals
}