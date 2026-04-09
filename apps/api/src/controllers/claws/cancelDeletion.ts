import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptions } from '@/lib/polar'
import { subscriptionStatus } from '@/lib/constants'
import { sanitizeClaw, withClaw } from '@/controllers/claws/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const cancelDeletion = withErrorHandler(
    'cancelDeletion',
    'api.failedToCancelDeletion'
)(
    withClaw()(async (c, claw) => {
        const id = c.req.param('id')!

        if (!claw.deletionScheduledAt)
            return fail(c, t('api.clawNotScheduledForDeletion'), 400)

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
    })
)

export default cancelDeletion