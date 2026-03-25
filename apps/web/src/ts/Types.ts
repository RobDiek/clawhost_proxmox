import type { TranscriptionResult } from '@/ts/Interfaces'
import type { billingInterval, clawStatus, userRole } from '@openclaw/shared'
import type {
    AGENT_DETAIL_TABS,
    CLAW_DETAIL_TABS,
    DASHBOARD_TABS,
    ROUTES,
    THEMES,
    LANGUAGES
} from '@/lib/constants'

export type ProviderType = 'hetzner' | 'local'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export type ClawStatus = (typeof clawStatus)[keyof typeof clawStatus]

export type CopiedFieldType = 'command' | 'private' | null

export type SSHKeyModalMode = 'upload' | 'generate'

export type UserRole = (typeof userRole)[keyof typeof userRole]

export type AuthMethod = 'email' | 'google' | 'github'

export type OAuthProvider = 'google' | 'github'

export type PlaygroundNodeType = 'claw' | 'agent'

export type PlaygroundDetailTab =
    (typeof CLAW_DETAIL_TABS)[keyof typeof CLAW_DETAIL_TABS]

export type PlaygroundAgentDetailTab =
    (typeof AGENT_DETAIL_TABS)[keyof typeof AGENT_DETAIL_TABS]

export type CompareFeatureStatus = 'yes' | 'no' | 'partial'

export type BillingInterval =
    (typeof billingInterval)[keyof typeof billingInterval]

export type ClawAvatarSize = 'sm' | 'md' | 'lg'

export type GatewayConnectionState =
    | 'disconnected'
    | 'connecting'
    | 'authenticating'
    | 'connected'
    | 'error'

export type ChatMessageRole = 'user' | 'assistant'

export type ChatMessageStatus = 'complete' | 'streaming' | 'error' | 'aborted'

export type LoginLoadingMethod = 'email' | 'google' | 'github' | 'resend' | null

export type ChatContentBlockType = 'text' | 'image'

export type GatewayEventHandler = (payload: unknown) => void

export type GatewayStateListener = (state: GatewayConnectionState) => void

export type Route = (typeof ROUTES)[keyof typeof ROUTES]

export type DashboardTab = (typeof DASHBOARD_TABS)[keyof typeof DASHBOARD_TABS]

export type ThemeMode = (typeof THEMES)[keyof typeof THEMES]

export type Language = (typeof LANGUAGES)[keyof typeof LANGUAGES]

export type ClawFileType =
    | 'json'
    | 'markdown'
    | 'javascript'
    | 'typescript'
    | 'yaml'
    | 'text'
    | 'unknown'

export type ChatSidebarViewMode = 'tree' | 'list'

export type Product = 'cloud' | 'go'

export type TerminalStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'error'
    | 'disconnected'

export type ChatTypingIndicator = 'thinking' | 'writing' | null

export type TranscriberFunction = (
    audio: Float32Array
) => Promise<TranscriptionResult>