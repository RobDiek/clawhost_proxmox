import type { AuthenticatedContext } from '@/ts/Types'

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { pendingAgents } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const cancelPendingAgent = withErrorHandler(
    'cancelPendingAgent',
    'api.failedToCancelPendingClaw'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!

    const result = await db
        .delete(pendingAgents)
        .where(and(eq(pendingAgents.id, id), eq(pendingAgents.userId, userId)))
        .returning()

    if (!result[0]) return fail(c, t('api.pendingClawNotFound'), 404)

    return ok(c, null, t('api.pendingClawCancelled'))
})

export default cancelPendingAgent