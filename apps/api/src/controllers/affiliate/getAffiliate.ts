import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users, referrals } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const getAffiliate = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')

        const referralRows = await db
            .select({
                id: referrals.id,
                referredEmail: users.email,
                status: referrals.status,
                earnedAmount: referrals.earnedAmount,
                createdAt: referrals.createdAt
            })
            .from(referrals)
            .innerJoin(users, eq(referrals.referredUserId, users.id))
            .where(eq(referrals.referrerId, userId))

        return ok(
            c,
            {
                referrals: referralRows.map((r) => ({
                    id: r.id,
                    referredEmail: r.referredEmail,
                    status: r.status,
                    earnedAmount: r.earnedAmount,
                    createdAt: r.createdAt?.toISOString() ?? ''
                }))
            },
            t('api.affiliateFetched')
        )
    } catch (err) {
        console.error('Get affiliate error:', err)
        return fail(
            c,
            err instanceof Error
                ? err.message
                : t('api.failedToGetAffiliate'),
            500
        )
    }
}

export default getAffiliate