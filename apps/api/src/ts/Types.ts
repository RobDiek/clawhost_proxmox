import type { Context } from 'hono'
import type {
    authMethod,
    billingInterval,
    clawFileType,
    userRole,
    versionGatedFeature
} from '@openclaw/shared'
import type {
    environment,
    featureEmailKey,
    piperVoiceQuality,
    subscriptionStatus,
    webhookEventType
} from '@/lib/constants'
import type { claws } from '@/db/schema'

export type HonoEnv = { Variables: { userId: string; isAdmin: boolean } }

export type AuthenticatedContext = Context<HonoEnv>

export type SubscriptionStatus =
    (typeof subscriptionStatus)[keyof typeof subscriptionStatus]

export type WebhookEventType =
    (typeof webhookEventType)[keyof typeof webhookEventType]

export type AuthMethod = (typeof authMethod)[keyof typeof authMethod]

export type UserRole = (typeof userRole)[keyof typeof userRole]

export type Environment = (typeof environment)[keyof typeof environment]

export type ClawFileType = (typeof clawFileType)[keyof typeof clawFileType]

export type PiperVoiceQuality =
    (typeof piperVoiceQuality)[keyof typeof piperVoiceQuality]

export type BillingInterval =
    (typeof billingInterval)[keyof typeof billingInterval]

export type PolarPriceMap = Record<string, number>

export type ClawRow = typeof claws.$inferSelect

export type VersionGatedFeature =
    (typeof versionGatedFeature)[keyof typeof versionGatedFeature]

export type FeatureEmailKey =
    (typeof featureEmailKey)[keyof typeof featureEmailKey]