import type { AuthenticatedContext } from '@/ts/Types'

import { asc, count, desc, sql } from 'drizzle-orm'
import { db } from '@/db'
import { pendingClaws, users } from '@/db/schema'
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const getAdminPendingClaws = withErrorHandler(
    'getAdminPendingClaws',
    'api.failedToGetAdminPendingClaws'
)(async (c: AuthenticatedContext) => {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
    const limit = Math.min(
        100,
        Math.max(1, parseInt(c.req.query('limit') || '20', 10))
    )
    const offset = (page - 1) * limit
    const sort = c.req.query('sort') || 'newest'

    const [totalResult, rows] = await Promise.all([
        db.select({ count: count() }).from(pendingClaws),
        db
            .select({
                id: pendingClaws.id,
                name: pendingClaws.name,
                planId: pendingClaws.planId,
                location: pendingClaws.location,
                priceMonthly: pendingClaws.priceMonthly,
                billingInterval: pendingClaws.billingInterval,
                createdAt: pendingClaws.createdAt,
                expiresAt: pendingClaws.expiresAt,
                userId: pendingClaws.userId,
                ownerEmail: users.email
            })
            .from(pendingClaws)
            .leftJoin(users, sql`${pendingClaws.userId} = ${users.id}`)
            .orderBy(
                sort === 'oldest'
                    ? asc(pendingClaws.createdAt)
                    : desc(pendingClaws.createdAt)
            )
            .limit(limit)
            .offset(offset)
    ])

    const total = totalResult[0]?.count || 0
    const totalPages = Math.ceil(total / limit)

    return ok(
        c,
        { items: rows, total, page, totalPages },
        t('api.adminPendingClawsFetched')
    )
})

export default getAdminPendingClaws