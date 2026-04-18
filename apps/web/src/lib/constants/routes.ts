import PATHS from '@/lib/paths'

const ROUTES = {
    HOME: PATHS.HOME,
    GO: `/${PATHS.GO}`,
    LOGIN: `/${PATHS.LOGIN}`,
    CLAWS: `/${PATHS.CLAWS}`,
    SSH_KEYS: `/${PATHS.SSH_KEYS}`,
    ACCOUNT: `/${PATHS.ACCOUNT}`,
    ADMIN: `/${PATHS.ADMIN}`,
    LICENSE: `/${PATHS.LICENSE}`,
    TERMS: `/${PATHS.TERMS}`,
    PRIVACY: `/${PATHS.PRIVACY}`,
    CHANGELOG: `/${PATHS.CHANGELOG}`,
    BLOG_POST: '/:slug',
    AFFILIATE: `/${PATHS.AFFILIATE}`,
    AFFILIATE_PROGRAM: `/${PATHS.AFFILIATE_PROGRAM}`,
    COMPARE: `/${PATHS.COMPARE}`
} as const

export default ROUTES