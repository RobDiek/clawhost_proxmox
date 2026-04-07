import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptions } from '@/lib/polar'
import { subscriptionStatus } from '@/lib/constants'
import { findUserClaw, sanitizeClaw } from '@/controllers/claws/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const cancelDeletion = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.deletionScheduledAt) {
            return fail(c, t('api.clawNotScheduledForDeletion'), 400)
        }

        if (claw.polarSubscriptionId) {
            try {
                await subscriptions.uncancel(claw.polarSubscriptionId)
            } catch (subError) {
                console.error('cancelDeletion', subError)
                return fail(c, t('api.failedToCancelScheduledDeletion'), 500)
            }
        }

        await db
            .update(claws)
            .set({
                deletionScheduledAt: null,
                subscriptionStatus: subscriptionStatus.active
            })
            .where(eq(claws.id, id))

        return ok(
            c,
            sanitizeClaw({
                ...claw,
                deletionScheduledAt: null,
                subscriptionStatus: subscriptionStatus.active
            }),
            t('api.clawDeletionCancelled')
        )
    } catch {
        return fail(c, t('api.failedToCancelDeletion'), 500)
    }
}

export default cancelDeletion