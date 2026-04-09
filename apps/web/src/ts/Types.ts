import type { OAuthCredential } from 'firebase/auth'
import type { OAuthWindowResult, TranscriptionResult } from '@/ts/Interfaces'
import type {
    authMethod,
    billingInterval,
    clawFileType,
    clawStatus,
    userRole
} from '@openclaw/shared'
import type {
    AFFILIATE_PERIOD,
    AGENT_DETAIL_TABS,
    CHANGELOG_FEATURE_TYPE,
    CHAT_CONTENT_BLOCK_TYPE,
    CHAT_MESSAGE_ROLE,
    CHAT_MESSAGE_STATUS,
    CHAT_SIDEBAR_VIEW_MODE,
    CHAT_TYPING_INDICATOR,
    CLAW_AVATAR_SIZE,
    CLAW_DETAIL_TABS,
    COMPARE_FEATURE_STATUS,
    COPIED_FIELD_TYPE,
    DASHBOARD_TABS,
    GATEWAY_CONNECTION_STATE,
    LOGIN_LOADING_METHOD,
    OAUTH_PROVIDER,
    PLAYGROUND_NODE_TYPE,
    PRODUCT,
    ROUTES,
    SSH_KEY_MODAL_MODE,
    TERMINAL_STATUS,
    THEMES,
    TOAST_TYPE,
    LANGUAGES
} from '@/lib/constants'

export type ToastType = (typeof TOAST_TYPE)[keyof typeof TOAST_TYPE]

export type ClawStatus = (typeof clawStatus)[keyof typeof clawStatus]

export type CopiedFieldType =
    | (typeof COPIED_FIELD_TYPE)[keyof typeof COPIED_FIELD_TYPE]
    | null

export type SSHKeyModalMode =
    (typeof SSH_KEY_MODAL_MODE)[keyof typeof SSH_KEY_MODAL_MODE]

export type UserRole = (typeof userRole)[keyof typeof userRole]

export type AuthMethod = (typeof authMethod)[keyof typeof authMethod]

export type OAuthProvider = (typeof OAUTH_PROVIDER)[keyof typeof OAUTH_PROVIDER]

export type PlaygroundNodeType =
    (typeof PLAYGROUND_NODE_TYPE)[keyof typeof PLAYGROUND_NODE_TYPE]

export type PlaygroundDetailTab =
    (typeof CLAW_DETAIL_TABS)[keyof typeof CLAW_DETAIL_TABS]

export type PlaygroundAgentDetailTab =
    (typeof AGENT_DETAIL_TABS)[keyof typeof AGENT_DETAIL_TABS]

export type CompareFeatureStatus =
    (typeof COMPARE_FEATURE_STATUS)[keyof typeof COMPARE_FEATURE_STATUS]

export type BillingInterval =
    (typeof billingInterval)[keyof typeof billingInterval]

export type ClawAvatarSize =
    (typeof CLAW_AVATAR_SIZE)[keyof typeof CLAW_AVATAR_SIZE]

export type GatewayConnectionState =
    (typeof GATEWAY_CONNECTION_STATE)[keyof typeof GATEWAY_CONNECTION_STATE]

export type ChatMessageRole =
    (typeof CHAT_MESSAGE_ROLE)[keyof typeof CHAT_MESSAGE_ROLE]

export type ChatMessageStatus =
    (typeof CHAT_MESSAGE_STATUS)[keyof typeof CHAT_MESSAGE_STATUS]

export type LoginLoadingMethod =
    | (typeof LOGIN_LOADING_METHOD)[keyof typeof LOGIN_LOADING_METHOD]
    | null

export type ChatContentBlockType =
    (typeof CHAT_CONTENT_BLOCK_TYPE)[keyof typeof CHAT_CONTENT_BLOCK_TYPE]

export type GatewayEventHandler = (payload: unknown) => void

export type GatewayStateListener = (state: GatewayConnectionState) => void

export type Route = (typeof ROUTES)[keyof typeof ROUTES]

export type DashboardTab = (typeof DASHBOARD_TABS)[keyof typeof DASHBOARD_TABS]

export type ThemeMode = (typeof THEMES)[keyof typeof THEMES]

export type Language = (typeof LANGUAGES)[keyof typeof LANGUAGES]

export type ClawFileType = (typeof clawFileType)[keyof typeof clawFileType]

export type ChatSidebarViewMode =
    (typeof CHAT_SIDEBAR_VIEW_MODE)[keyof typeof CHAT_SIDEBAR_VIEW_MODE]

export type Product = (typeof PRODUCT)[keyof typeof PRODUCT]

export type TerminalStatus =
    (typeof TERMINAL_STATUS)[keyof typeof TERMINAL_STATUS]

export type ChatTypingIndicator =
    | (typeof CHAT_TYPING_INDICATOR)[keyof typeof CHAT_TYPING_INDICATOR]
    | null

export type AffiliatePeriod =
    (typeof AFFILIATE_PERIOD)[keyof typeof AFFILIATE_PERIOD]

export type ChangelogFeatureType =
    (typeof CHANGELOG_FEATURE_TYPE)[keyof typeof CHANGELOG_FEATURE_TYPE]

export type TranscriberFunction = (
    audio: Float32Array
) => Promise<TranscriptionResult>

export type AdminAnalyticsRange = 'day' | 'week' | 'month' | 'year' | 'all'

export type ResolveConflictFn = (
    credential: OAuthCredential | null,
    providerId: string
) => Promise<boolean>

export type ElectronOAuthFn = (
    providerUrl: string,
    callbackPrefix: string
) => Promise<OAuthWindowResult>