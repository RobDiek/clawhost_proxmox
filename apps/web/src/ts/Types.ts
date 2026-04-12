import type { OAuthCredential } from 'firebase/auth'
import type {
    OAuthWindowResult,
    PendingConflict,
    TranscriptionResult
} from '@/ts/Interfaces'
import type {
    authMethod,
    billingInterval,
    clawFileType,
    clawStatus,
    userRole
} from '@openclaw/shared'
import type {
    AFFILIATE_PERIOD,
    CHANGELOG_FEATURE_TYPE,
    CLAW_AVATAR_SIZE,
    CLAW_DETAIL_TABS,
    COMPARE_FEATURE_STATUS,
    COPIED_FIELD_TYPE,
    LOGIN_LOADING_METHOD,
    OAUTH_PROVIDER,
    PREVIEW_STATUS,
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

export type ClawDetailTab =
    (typeof CLAW_DETAIL_TABS)[keyof typeof CLAW_DETAIL_TABS]

export type PreviewStatus =
    (typeof PREVIEW_STATUS)[keyof typeof PREVIEW_STATUS]

export type CompareFeatureStatus =
    (typeof COMPARE_FEATURE_STATUS)[keyof typeof COMPARE_FEATURE_STATUS]

export type BillingInterval =
    (typeof billingInterval)[keyof typeof billingInterval]

export type ClawAvatarSize =
    (typeof CLAW_AVATAR_SIZE)[keyof typeof CLAW_AVATAR_SIZE]

export type LoginLoadingMethod =
    | (typeof LOGIN_LOADING_METHOD)[keyof typeof LOGIN_LOADING_METHOD]
    | null

export type Route = (typeof ROUTES)[keyof typeof ROUTES]

export type ThemeMode = (typeof THEMES)[keyof typeof THEMES]

export type Language = (typeof LANGUAGES)[keyof typeof LANGUAGES]

export type ClawFileType = (typeof clawFileType)[keyof typeof clawFileType]

export type Product = (typeof PRODUCT)[keyof typeof PRODUCT]

export type TerminalStatus =
    (typeof TERMINAL_STATUS)[keyof typeof TERMINAL_STATUS]

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
    providerId: string,
    conflictEmail: string | undefined
) => PendingConflict | null

export type ElectronOAuthFn = (
    providerUrl: string,
    callbackPrefix: string
) => Promise<OAuthWindowResult>