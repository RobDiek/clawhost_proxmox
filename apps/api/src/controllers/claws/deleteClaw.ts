import type { AuthenticatedContext, ProviderType } from '@/ts/Types'

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { claws, pendingClaws } from '@/db/schema'
import { subscriptions, checkouts } from '@/lib/polar'
import {
    cleanupClaw,
    findUserClaw,
    sanitizeClaw
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const deleteClaw = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!

        if (id.startsWith('pending-')) {
            const pendingId = id.replace('pending-', '')
            const result = await db
                .delete(pendingClaws)
                .where(
                    and(
                        eq(pendingClaws.id, pendingId),
                        eq(pendingClaws.userId, userId)
                    )
                )
                .returning()

            if (!result[0]) {
                return fail(c, t('api.pendingClawNotFound'), 404)
            }

            const pending = result[0]
            try {
                const checkout = await checkouts.get(pending.checkoutId)
                if (checkout?.subscriptionId) {
                    await subscriptions.revoke(checkout.subscriptionId)
                }
            } catch (subErr) {
                console.error('Failed to revoke pending subscription:', subErr)
            }

            return ok(c, { scheduled: false }, t('api.clawDeleted'))
        }

        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (claw.polarSubscriptionId) {
            try {
                const sub = await subscriptions.get(claw.polarSubscriptionId)

                if (sub && sub.currentPeriodEnd) {
                    await subscriptions.cancel(claw.polarSubscriptionId)

                    await db
                        .update(claws)
                        .set({
                            deletionScheduledAt: sub.currentPeriodEnd,
                            subscriptionStatus: 'canceled'
                        })
                        .where(eq(claws.id, id))

                    return ok(
                        c,
                        {
                            scheduled: true,
                            deletionScheduledAt:
                                sub.currentPeriodEnd.toISOString(),
                            claw: sanitizeClaw({
                                ...claw,
                                deletionScheduledAt: sub.currentPeriodEnd,
                                subscriptionStatus: 'canceled'
                            })
                        },
                        t('api.clawDeletionScheduled')
                    )
                }
            } catch (subErr) {
                console.error(
                    'Failed to schedule deletion via subscription:',
                    subErr
                )
            }
        }

        await Promise.all([
            claw.polarSubscriptionId
                ? subscriptions
                      .revoke(claw.polarSubscriptionId)
                      .catch((subErr) => {
                          console.error(
                              'Failed to revoke subscription:',
                              subErr
                          )
                      })
                : Promise.resolve(),
            cleanupClaw(id, {
                provider: (claw.provider || 'hetzner') as ProviderType,
                providerServerId: claw.providerServerId,
                subdomain: claw.subdomain
            })
        ])

        return ok(c, { scheduled: false }, t('api.clawDeleted'))
    } catch {
        return fail(c, t('api.failedToDeleteClaw'), 500)
    }
}

export default deleteClaw