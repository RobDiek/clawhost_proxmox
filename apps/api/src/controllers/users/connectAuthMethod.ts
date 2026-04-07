import type { AuthenticatedContext } from '@/ts/Types'

import { eq, sql } from 'drizzle-orm'
import { authMethod } from '@openclaw/shared'
import { db } from '@/db'
import { users } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const VALID_METHODS = [authMethod.google, authMethod.github] as const

const connectAuthMethod = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const method = c.req.param('method')!

        if (!VALID_METHODS.includes(method as (typeof VALID_METHODS)[number])) {
            return fail(c, t('api.invalidAuthMethod'), 400)
        }

        await db
            .update(users)
            .set({
                authMethods: sql`CASE
                    WHEN ${method} = ANY(COALESCE(${users.authMethods}, '{}'))
                    THEN COALESCE(${users.authMethods}, '{}')
                    ELSE array_append(COALESCE(${users.authMethods}, '{}'), ${method})
                END`
            })
            .where(eq(users.id, userId))

        return ok(c, null, t('api.authMethodConnected'))
    } catch (error) {
        console.error('connectAuthMethod', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToConnectAuthMethod'),
            500
        )
    }
}

export default connectAuthMethod