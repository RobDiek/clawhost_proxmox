import type { Context } from 'hono'
import type { billingInterval, userRole } from '@openclaw/shared'

export type ProviderType = 'hetzner'

export type HonoEnv = { Variables: { userId: string; isAdmin: boolean } }

export type AuthenticatedContext = Context<HonoEnv>

export type SubscriptionStatus =
    | 'active'
    | 'canceled'
    | 'incomplete'
    | 'incomplete_expired'
    | 'past_due'
    | 'trialing'
    | 'unpaid'
    | 'revoked'

export type WebhookEventType =
    | 'checkout.created'
    | 'checkout.updated'
    | 'subscription.created'
    | 'subscription.active'
    | 'subscription.updated'
    | 'subscription.canceled'
    | 'subscription.revoked'
    | 'subscription.uncanceled'
    | 'order.created'
    | 'order.paid'
    | 'order.refunded'

export type AuthMethod = 'email' | 'google' | 'github'

export type UserRole = (typeof userRole)[keyof typeof userRole]

export type Environment = 'development' | 'production'

export type ClawFileType =
    | 'json'
    | 'markdown'
    | 'javascript'
    | 'typescript'
    | 'yaml'
    | 'text'
    | 'unknown'

export type PiperVoiceQuality = 'low' | 'medium' | 'high'

export type BillingInterval =
    (typeof billingInterval)[keyof typeof billingInterval]

export type PolarPriceMap = Record<string, Record<string, number>>

export type ClawRow = typeof import('@/db/schema').claws.$inferSelect

export type FeatureEmailKey =
    | 'terminal'
    | 'logs'
    | 'channels'
    | 'fileExplorer'
    | 'playground'
    | 'agentChat'
    | 'voiceMode'
    | 'skills'
    | 'bindings'
    | 'envVars'
    | 'diagnostics'
    | 'sshKeys'
    | 'exportConfig'
    | 'multiLanguage'
    | 'subdomain'
    | 'darkMode'
    | 'reinstall'
    | 'yearlyPlans'