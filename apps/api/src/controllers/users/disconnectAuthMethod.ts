import type { AuthenticatedContext } from '@/ts/Types'

import { eq, sql } from 'drizzle-orm'
import { authMethod } from '@openclaw/shared'
import { db } from '@/db'
import { users } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const VALID_METHODS = [authMethod.google, authMethod.github] as const

const disconnectAuthMethod = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const method = c.req.param('method')!

        if (!VALID_METHODS.includes(method as (typeof VALID_METHODS)[number])) {
            return fail(c, t('api.invalidAuthMethod'), 400)
        }

        const user = await db
            .select({ authMethods: users.authMethods })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)

        if (!user[0]) return fail(c, t('api.userNotFound'), 404)

        const methods = user[0].authMethods || []

        if (!methods.includes(method)) {
            return fail(c, t('api.authMethodNotConnected'), 400)
        }

        await db
            .update(users)
            .set({
                authMethods: sql`array_remove(${users.authMethods}, ${method})`
            })
            .where(eq(users.id, userId))

        return ok(c, null, t('api.authMethodDisconnected'))
    } catch (error) {
        console.error('disconnectAuthMethod', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToDisconnectAuthMethod'),
            500
        )
    }
}

export default disconnectAuthMethod