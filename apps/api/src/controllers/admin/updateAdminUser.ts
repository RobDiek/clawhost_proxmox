import type { AuthenticatedContext } from '@/ts/Types'
import type { AdminUpdateFields } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const updateAdminUser = async (c: AuthenticatedContext) => {
    try {
        const userId = c.req.param('id')
        if (!userId) {
            return fail(c, t('api.userNotFound'), 404)
        }

        const body = await c.req.json()
        const { name, referralCode } = body

        const existing = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)

        if (!existing[0]) {
            return fail(c, t('api.userNotFound'), 404)
        }

        const updates: AdminUpdateFields = {}
        if (name !== undefined) updates.name = name || null
        if (referralCode !== undefined)
            updates.referralCode = referralCode || null

        await db.update(users).set(updates).where(eq(users.id, userId))

        return ok(c, null, t('api.adminUserUpdated'))
    } catch (err) {
        console.error(err)
        return fail(c, t('api.failedToUpdateAdminUser'), 500)
    }
}

export default updateAdminUser