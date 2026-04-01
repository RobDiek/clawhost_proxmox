import type { AuthenticatedContext } from '@/ts/Types'

import { asc, count, desc, ilike } from 'drizzle-orm'
import { db } from '@/db'
import { waitlist } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const getAdminWaitlist = async (c: AuthenticatedContext) => {
    try {
        const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
        const limit = Math.min(
            100,
            Math.max(1, parseInt(c.req.query('limit') || '20', 10))
        )
        const offset = (page - 1) * limit
        const search = c.req.query('search')?.trim() || ''
        const sort = c.req.query('sort') || 'newest'

        const whereClause = search
            ? ilike(waitlist.email, `%${search}%`)
            : undefined

        const [totalResult, rows] = await Promise.all([
            db.select({ count: count() }).from(waitlist).where(whereClause),
            db
                .select({
                    id: waitlist.id,
                    email: waitlist.email,
                    userId: waitlist.userId,
                    createdAt: waitlist.createdAt
                })
                .from(waitlist)
                .where(whereClause)
                .orderBy(
                    sort === 'oldest'
                        ? asc(waitlist.createdAt)
                        : desc(waitlist.createdAt)
                )
                .limit(limit)
                .offset(offset)
        ])

        const total = totalResult[0]?.count || 0
        const totalPages = Math.ceil(total / limit)

        return ok(
            c,
            { items: rows, total, page, totalPages },
            t('api.adminWaitlistFetched')
        )
    } catch (err) {
        console.error('Get admin waitlist error:', err)
        return fail(c, t('api.failedToGetAdminWaitlist'), 500)
    }
}

export default getAdminWaitlist