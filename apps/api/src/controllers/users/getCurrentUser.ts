import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const getCurrentUser = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')

        const user = await db
            .select({
                id: users.id,
                email: users.email,
                name: users.name,
                role: users.role,
                authMethods: users.authMethods,
                hasLicense: users.hasLicense,
                referralCode: users.referralCode,
                referralCodeChanged: users.referralCodeChanged,
                createdAt: users.createdAt
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)

        if (!user[0]) return fail(c, t('api.userNotFound'), 404)

        return ok(c, user[0], t('api.profileFetched'))
    } catch (error) {
        console.error('getCurrentUser', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToGetProfile'),
            500
        )
    }
}

export default getCurrentUser