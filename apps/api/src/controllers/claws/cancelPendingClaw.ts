import type { AuthenticatedContext } from '@/ts/Types'

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { pendingClaws } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const cancelPendingClaw = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!

        const result = await db
            .delete(pendingClaws)
            .where(
                and(eq(pendingClaws.id, id), eq(pendingClaws.userId, userId))
            )
            .returning()

        if (!result[0]) {
            return fail(c, t('api.pendingClawNotFound'), 404)
        }

        return ok(c, null, t('api.pendingClawCancelled'))
    } catch {
        return fail(c, t('api.failedToCancelPendingClaw'), 500)
    }
}

export default cancelPendingClaw