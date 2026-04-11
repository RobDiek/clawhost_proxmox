import { externalUrls } from '@openclaw/shared'

const GENERALS = externalUrls.CLAWHOST.CDN_GENERALS
const EMAILS = externalUrls.CLAWHOST.CDN_EMAILS

const CDN_ASSETS = {
    LOGO_DARK: `${GENERALS}/clawhost-logo-dark.png`,
    LOGO_LIGHT: `${GENERALS}/clawhost-logo-light.png`,
    FEATURE_TERMINAL: `${EMAILS}/features/terminal.gif`,
    FEATURE_LOGS: `${EMAILS}/features/logs.gif`,
    FEATURE_FILE_EXPLORER: `${EMAILS}/features/file-explorer.gif`,
    FEATURE_DIAGNOSTICS: `${EMAILS}/features/diagnostics.gif`,
    FEATURE_SSH_KEYS: `${EMAILS}/features/ssh-keys.gif`,
    FEATURE_EXPORT_CONFIG: `${EMAILS}/features/export-config.gif`,
    FEATURE_MULTI_LANGUAGE: `${EMAILS}/features/multi-language.gif`,
    FEATURE_SUBDOMAIN: `${EMAILS}/features/subdomain.gif`,
    FEATURE_DARK_MODE: `${EMAILS}/features/dark-mode.gif`,
    FEATURE_REINSTALL: `${EMAILS}/features/reinstall.gif`,
    FEATURE_YEARLY_PLANS: `${EMAILS}/features/yearly-plans.gif`,
    EMAIL_SIMPLIFIED_PLATFORM: `${EMAILS}/lobster-moving-fast.gif`,
}

export default CDN_ASSETS