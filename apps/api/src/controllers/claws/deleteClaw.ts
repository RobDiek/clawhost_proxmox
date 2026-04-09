import type { AuthenticatedContext } from '@/ts/Types'

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { claws, pendingClaws } from '@/db/schema'
import { subscriptions, checkouts } from '@/lib/polar'
import { subscriptionStatus } from '@/lib/constants'
import {
    cleanupClaw,
    findUserClaw,
    sanitizeClaw
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const deleteClaw = withErrorHandler(
    'deleteClaw',
    'api.failedToDeleteClaw'
)(async (c: AuthenticatedContext) => {
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

        if (!result[0]) return fail(c, t('api.pendingClawNotFound'), 404)

        const pending = result[0]
        try {
            const checkout = await checkouts.get(pending.checkoutId)
            if (checkout?.subscriptionId) {
                await subscriptions.revoke(checkout.subscriptionId)
            }
        } catch (subError) {
            console.error('deleteClaw', subError)
        }

        return ok(c, { scheduled: false }, t('api.clawDeleted'))
    }

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (claw.polarSubscriptionId) {
        try {
            const sub = await subscriptions.get(claw.polarSubscriptionId)

            if (sub && sub.currentPeriodEnd) {
                await subscriptions.cancel(claw.polarSubscriptionId)

                await db
                    .update(claws)
                    .set({
                        deletionScheduledAt: sub.currentPeriodEnd,
                        subscriptionStatus: subscriptionStatus.canceled
                    })
                    .where(eq(claws.id, id))

                return ok(
                    c,
                    {
                        scheduled: true,
                        deletionScheduledAt: sub.currentPeriodEnd.toISOString(),
                        claw: sanitizeClaw({
                            ...claw,
                            deletionScheduledAt: sub.currentPeriodEnd,
                            subscriptionStatus: subscriptionStatus.canceled
                        })
                    },
                    t('api.clawDeletionScheduled')
                )
            }
        } catch (subError) {
            console.error('deleteClaw', subError)
        }
    }

    await Promise.all([
        claw.polarSubscriptionId
            ? subscriptions
                  .revoke(claw.polarSubscriptionId)
                  .catch((subError) => {
                      console.error('deleteClaw', subError)
                  })
            : Promise.resolve(),
        cleanupClaw(id, {
            providerServerId: claw.providerServerId,
            subdomain: claw.subdomain
        })
    ])

    return ok(c, { scheduled: false }, t('api.clawDeleted'))
})

export default deleteClaw