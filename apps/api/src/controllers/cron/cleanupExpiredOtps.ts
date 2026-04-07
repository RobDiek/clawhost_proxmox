import type { Context } from 'hono'

import { lt } from 'drizzle-orm'
import { db } from '@/db'
import { otpCodes } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const cleanupExpiredOtps = async (c: Context) => {
    try {
        const deleted = await db
            .delete(otpCodes)
            .where(lt(otpCodes.expiresAt, new Date()))
            .returning({ id: otpCodes.id })

        return ok(c, { deleted: deleted.length })
    } catch {
        return fail(c, t('api.internalServerError'), 500)
    }
}

export default cleanupExpiredOtps