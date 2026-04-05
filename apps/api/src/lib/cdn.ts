import { externalUrls } from '@openclaw/shared'

const CDN_URL = externalUrls.CLAWHOST.CDN
const SITE_URL = externalUrls.CLAWHOST.BASE

const CDN_ASSETS = {
    LOGO_DARK: `${CDN_URL}/assets/clawhost-logo-dark.png`,
    LOGO_LIGHT: `${CDN_URL}/assets/clawhost-logo-light.png`,
    FEATURE_TERMINAL: `${CDN_URL}/assets/features/terminal.gif`,
    FEATURE_LOGS: `${CDN_URL}/assets/features/logs.gif`,
    FEATURE_CHANNELS: `${CDN_URL}/assets/features/channels.gif`,
    FEATURE_FILE_EXPLORER: `${CDN_URL}/assets/features/file-explorer.gif`,
    FEATURE_PLAYGROUND: `${CDN_URL}/assets/features/playground.gif`,
    FEATURE_AGENT_CHAT: `${CDN_URL}/assets/features/agent-chat.gif`,
    FEATURE_VOICE_MODE: `${CDN_URL}/assets/features/voice-mode.gif`,
    FEATURE_SKILLS: `${CDN_URL}/assets/features/skills.gif`,
    FEATURE_BINDINGS: `${CDN_URL}/assets/features/bindings.gif`,
    FEATURE_ENV_VARS: `${CDN_URL}/assets/features/env-vars.gif`,
    FEATURE_DIAGNOSTICS: `${CDN_URL}/assets/features/diagnostics.gif`,
    FEATURE_SSH_KEYS: `${CDN_URL}/assets/features/ssh-keys.gif`,
    FEATURE_EXPORT_CONFIG: `${CDN_URL}/assets/features/export-config.gif`,
    FEATURE_MULTI_LANGUAGE: `${CDN_URL}/assets/features/multi-language.gif`,
    FEATURE_SUBDOMAIN: `${CDN_URL}/assets/features/subdomain.gif`,
    FEATURE_DARK_MODE: `${CDN_URL}/assets/features/dark-mode.gif`,
    FEATURE_REINSTALL: `${CDN_URL}/assets/features/reinstall.gif`,
    FEATURE_YEARLY_PLANS: `${CDN_URL}/assets/features/yearly-plans.gif`
}

export { SITE_URL }
export default CDN_ASSETS