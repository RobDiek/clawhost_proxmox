import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { orders } from '@/lib/polar'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const getUserStats = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')

        const userResult = await db
            .select({ polarCustomerId: users.polarCustomerId })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)

        let orderCount = 0
        const polarCustomerId = userResult[0]?.polarCustomerId
        if (polarCustomerId) {
            try {
                const result = await orders.listByCustomer(
                    polarCustomerId,
                    1,
                    1
                )
                orderCount = result.totalCount
            } catch {}
        }

        return ok(
            c,
            {
                orderCount
            },
            t('api.statsFetched')
        )
    } catch (err) {
        console.error('Get user stats error:', err)
        return fail(c, t('api.failedToGetStats'), 500)
    }
}

export default getUserStats