import type { AuthenticatedContext } from '@/ts/Types'

import { eq, count } from 'drizzle-orm'
import { db } from '@/db'
import { claws, sshKeys, users } from '@/db/schema'
import { orders } from '@/lib/polar'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const getUserStats = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')

        const [clawResult, sshKeyResult, userResult] = await Promise.all([
            db
                .select({ count: count() })
                .from(claws)
                .where(eq(claws.userId, userId)),
            db
                .select({ count: count() })
                .from(sshKeys)
                .where(eq(sshKeys.userId, userId)),
            db
                .select({ polarCustomerId: users.polarCustomerId })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1)
        ])

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
                clawCount: clawResult[0]?.count || 0,
                sshKeyCount: sshKeyResult[0]?.count || 0,
                orderCount
            },
            t('api.statsFetched')
        )
    } catch (error) {
        console.error('getUserStats', error)
        return fail(c, t('api.failedToGetStats'), 500)
    }
}

export default getUserStats