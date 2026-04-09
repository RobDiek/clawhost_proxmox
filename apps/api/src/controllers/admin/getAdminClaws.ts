import type { AuthenticatedContext } from '@/ts/Types'

import { asc, count, desc, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { claws, users } from '@/db/schema'
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const getAdminClaws = withErrorHandler(
    'getAdminClaws',
    'api.failedToGetAdminClaws'
)(async (c: AuthenticatedContext) => {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
    const limit = Math.min(
        100,
        Math.max(1, parseInt(c.req.query('limit') || '20', 10))
    )
    const offset = (page - 1) * limit
    const search = c.req.query('search')?.trim() || ''
    const sort = c.req.query('sort') || 'newest'

    const conditions = []

    if (search) {
        conditions.push(
            or(
                ilike(claws.name, `%${search}%`),
                ilike(claws.ip, `%${search}%`)
            )!
        )
    }

    const whereClause =
        conditions.length > 0
            ? sql`${sql.join(
                  conditions.map((c) => sql`(${c})`),
                  sql` AND `
              )}`
            : undefined

    const [totalResult, clawRows] = await Promise.all([
        db.select({ count: count() }).from(claws).where(whereClause),
        db
            .select({
                id: claws.id,
                name: claws.name,
                status: claws.status,
                ip: claws.ip,
                planId: claws.planId,
                location: claws.location,
                subdomain: claws.subdomain,
                subscriptionStatus: claws.subscriptionStatus,
                billingInterval: claws.billingInterval,
                deletionScheduledAt: claws.deletionScheduledAt,
                createdAt: claws.createdAt,
                userId: claws.userId,
                ownerEmail: users.email
            })
            .from(claws)
            .leftJoin(users, sql`${claws.userId} = ${users.id}`)
            .where(whereClause)
            .orderBy(
                sort === 'oldest' ? asc(claws.createdAt) : desc(claws.createdAt)
            )
            .limit(limit)
            .offset(offset)
    ])

    const total = totalResult[0]?.count || 0
    const totalPages = Math.ceil(total / limit)

    return ok(
        c,
        { items: clawRows, total, page, totalPages },
        t('api.adminClawsFetched')
    )
})

export default getAdminClaws