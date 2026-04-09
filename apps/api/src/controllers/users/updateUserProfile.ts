import type { UpdateProfileBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { inputValidation } from '@openclaw/shared'
import { db } from '@/db'
import { users } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const updateUserProfile = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const { name } = await c.req.json<UpdateProfileBody>()

        if (name !== undefined && name.length > inputValidation.USER_NAME.MAX) {
            return fail(
                c,
                t('api.nameTooLong', { max: inputValidation.USER_NAME.MAX }),
                400
            )
        }

        const updated = await db
            .update(users)
            .set({ name: name?.trim() || null })
            .where(eq(users.id, userId))
            .returning({
                id: users.id,
                email: users.email,
                name: users.name,
                role: users.role,
                createdAt: users.createdAt
            })

        return ok(c, updated[0], t('api.profileUpdated'))
    } catch (error) {
        console.error('updateUserProfile', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToUpdateProfile'),
            500
        )
    }
}

export default updateUserProfile