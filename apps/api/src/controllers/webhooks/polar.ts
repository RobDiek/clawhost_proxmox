import type { Context } from 'hono'
import type {
    SubscriptionWebhookData,
    CheckoutWebhookData
} from '@/ts/Interfaces'

import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { subscriptionStatus } from '@/lib/constants'
import { claws, users, referrals, referralPayments } from '@/db/schema'
import { parseWebhook, handleWebhook } from '@/lib/polar'
import { provisionClaw } from '@/controllers/claws'
import { getProvider } from '@/services/provider'
import { cleanupClaw } from '@/controllers/claws/helpers'
import { ok, fail } from '@/lib/response'
import { getEnvironment, PROD } from '@/lib/environment'
import { t } from '@openclaw/i18n'

const trackReferral = async (userId: string, referralCode: string, paymentType: string) => {
    try {
        const referrer = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.referralCode, referralCode))
            .limit(1)
            .then((rows) => rows[0])

        if (!referrer || referrer.id === userId) return

        const referralId = crypto.randomUUID()

        const inserted = await db
            .insert(referrals)
            .values({
                id: referralId,
                referrerId: referrer.id,
                referredUserId: userId
            })
            .onConflictDoNothing()
            .returning({ id: referrals.id })

        const existingReferralId = inserted[0]?.id ?? await db
            .select({ id: referrals.id })
            .from(referrals)
            .where(eq(referrals.referredUserId, userId))
            .limit(1)
            .then((rows) => rows[0]?.id)

        if (existingReferralId) {
            await db.insert(referralPayments).values({
                id: crypto.randomUUID(),
                referralId: existingReferralId,
                type: paymentType
            })
        }

        await db
            .update(users)
            .set({ referredBy: referralCode })
            .where(eq(users.id, userId))
    } catch (err) {
        console.error('Failed to track referral:', err)
    }
}

const handlePolarWebhook = async (c: Context) => {
    try {
        const event = await parseWebhook(c)

        if (!event) {
            return fail(c, t('api.invalidWebhook'), 400)
        }

        await handleWebhook(event, {
            onCheckoutUpdated: async (data: CheckoutWebhookData) => {
                if (data.status !== 'succeeded') {
                    return
                }

                if (
                    data.metadata?.type === 'license' &&
                    data.metadata?.userId
                ) {
                    const currentEnv = getEnvironment(c)
                    const eventEnv = data.metadata?.environment || PROD

                    if (eventEnv !== currentEnv) {
                        return
                    }

                    await db
                        .update(users)
                        .set({ hasLicense: true })
                        .where(eq(users.id, data.metadata.userId))

                    if (data.metadata.referralCode) {
                        await trackReferral(data.metadata.userId, data.metadata.referralCode, 'license')
                    }
                }
            },

            onSubscriptionActive: async (data: SubscriptionWebhookData) => {
                const currentEnv = getEnvironment(c)
                const eventEnv = data.metadata?.environment || PROD

                if (eventEnv !== currentEnv) {
                    return
                }

                const existingClaw = await db
                    .select({ id: claws.id })
                    .from(claws)
                    .where(eq(claws.polarSubscriptionId, data.id))
                    .limit(1)

                if (existingClaw[0]) {
                    return
                }

                const pendingClawId = data.metadata?.pendingClawId
                if (!pendingClawId) {
                    return
                }

                provisionClaw({
                    pendingClawId,
                    subscriptionId: data.id,
                    customerId: data.customerId,
                    productId: data.productId
                }).then((result) => {
                    if (result.success && result.referralCode && data.metadata?.userId) {
                        trackReferral(data.metadata.userId, result.referralCode, 'purchase')
                    }
                }).catch((err) =>
                    console.error(`Failed to provision claw: ${err}`)
                )
            },

            onSubscriptionCanceled: async (data: SubscriptionWebhookData) => {
                const deletionScheduledAt = data.currentPeriodEnd
                    ? new Date(data.currentPeriodEnd)
                    : null

                await db
                    .update(claws)
                    .set({
                        subscriptionStatus: subscriptionStatus.canceled,
                        ...(deletionScheduledAt ? { deletionScheduledAt } : {})
                    })
                    .where(eq(claws.polarSubscriptionId, data.id))
            },

            onSubscriptionRevoked: async (data: SubscriptionWebhookData) => {
                const claw = await db
                    .select({
                        id: claws.id,
                        provider: claws.provider,
                        providerServerId: claws.providerServerId,
                        subdomain: claws.subdomain,
                        deletionScheduledAt: claws.deletionScheduledAt
                    })
                    .from(claws)
                    .where(eq(claws.polarSubscriptionId, data.id))
                    .limit(1)

                if (!claw[0]) {
                    return
                }

                if (claw[0].deletionScheduledAt) {
                    cleanupClaw(claw[0].id, {
                        providerServerId: claw[0].providerServerId,
                        subdomain: claw[0].subdomain
                    }).catch((err) => {
                        console.error(
                            `Failed to cleanup claw ${claw[0].id}:`,
                            err
                        )
                        db.update(claws)
                            .set({
                                subscriptionStatus: subscriptionStatus.revoked,
                                status: clawStatus.stopped
                            })
                            .where(eq(claws.id, claw[0].id))
                            .catch(() => {})
                    })
                    return
                }

                if (claw[0].providerServerId) {
                    const provider = getProvider()
                    Promise.all([
                        db
                            .update(claws)
                            .set({ subscriptionStatus: subscriptionStatus.revoked })
                            .where(eq(claws.id, claw[0].id)),
                        provider
                            .stopServer(claw[0].providerServerId)
                            .then(() =>
                                db
                                    .update(claws)
                                    .set({ status: clawStatus.stopped })
                                    .where(eq(claws.id, claw[0].id))
                            )
                            .catch((err) =>
                                console.error(`Failed to stop server: ${err}`)
                            )
                    ]).catch(() => {})
                } else {
                    db.update(claws)
                        .set({ subscriptionStatus: subscriptionStatus.revoked })
                        .where(eq(claws.id, claw[0].id))
                        .catch(() => {})
                }
            },

            onSubscriptionUncanceled: async (data: SubscriptionWebhookData) => {
                await db
                    .update(claws)
                    .set({
                        deletionScheduledAt: null,
                        subscriptionStatus: subscriptionStatus.active
                    })
                    .where(eq(claws.polarSubscriptionId, data.id))
            },

            onSubscriptionUpdated: async (data: SubscriptionWebhookData) => {
                const updated = await db
                    .update(claws)
                    .set({ subscriptionStatus: data.status })
                    .where(eq(claws.polarSubscriptionId, data.id))
                    .returning()

                if (
                    data.status === subscriptionStatus.pastDue &&
                    updated[0]?.providerServerId
                ) {
                    try {
                        const provider = getProvider()
                        await provider.stopServer(updated[0].providerServerId)
                        await db
                            .update(claws)
                            .set({ status: clawStatus.stopped })
                            .where(eq(claws.id, updated[0].id))
                    } catch (err) {
                        console.error(`Failed to stop server: ${err}`)
                    }
                }
            }
        })

        return ok(c, { received: true }, t('api.webhookReceived'))
    } catch (err) {
        console.error('Webhook error:', err)
        return fail(c, t('api.webhookProcessingFailed'), 500)
    }
}

export default handlePolarWebhook