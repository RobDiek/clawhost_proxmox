import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptions } from '@/lib/polar'
import { cleanupClaw } from '@/controllers/claws/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const hardDeleteClaw = async (c: AuthenticatedContext) => {
    try {
        const id = c.req.param('id')!
        const claw = await db
            .select()
            .from(claws)
            .where(eq(claws.id, id))
            .limit(1)

        if (!claw[0]) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw[0].deletionScheduledAt) {
            return fail(c, t('api.clawNotScheduledForDeletion'), 400)
        }

        await Promise.all([
            claw[0].polarSubscriptionId
                ? subscriptions
                      .revoke(claw[0].polarSubscriptionId)
                      .catch((subErr) => {
                          console.error(
                              'Failed to revoke subscription:',
                              subErr
                          )
                      })
                : Promise.resolve(),
            cleanupClaw(id, {
                providerServerId: claw[0].providerServerId,
                subdomain: claw[0].subdomain
            })
        ])

        return ok(c, null, t('api.clawHardDeleted'))
    } catch (err) {
        console.error('Hard delete claw error:', err)
        return fail(c, t('api.failedToHardDeleteClaw'), 500)
    }
}

export default hardDeleteClaw