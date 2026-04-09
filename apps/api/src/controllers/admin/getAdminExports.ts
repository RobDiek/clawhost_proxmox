import type { AuthenticatedContext } from '@/ts/Types'

import { asc, count, desc, sql } from 'drizzle-orm'
import { db } from '@/db'
import { clawExports, users, claws } from '@/db/schema'
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const getAdminExports = withErrorHandler(
    'getAdminExports',
    'api.failedToGetAdminExports'
)(async (c: AuthenticatedContext) => {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
    const limit = Math.min(
        100,
        Math.max(1, parseInt(c.req.query('limit') || '20', 10))
    )
    const offset = (page - 1) * limit
    const sort = c.req.query('sort') || 'newest'

    const [totalResult, rows] = await Promise.all([
        db.select({ count: count() }).from(clawExports),
        db
            .select({
                id: clawExports.id,
                fileSize: clawExports.fileSize,
                createdAt: clawExports.createdAt,
                userId: clawExports.userId,
                clawId: clawExports.clawId,
                ownerEmail: users.email,
                clawName: claws.name
            })
            .from(clawExports)
            .leftJoin(users, sql`${clawExports.userId} = ${users.id}`)
            .leftJoin(claws, sql`${clawExports.clawId} = ${claws.id}`)
            .orderBy(
                sort === 'oldest'
                    ? asc(clawExports.createdAt)
                    : desc(clawExports.createdAt)
            )
            .limit(limit)
            .offset(offset)
    ])

    const total = totalResult[0]?.count || 0
    const totalPages = Math.ceil(total / limit)

    return ok(
        c,
        { items: rows, total, page, totalPages },
        t('api.adminExportsFetched')
    )
})

export default getAdminExports