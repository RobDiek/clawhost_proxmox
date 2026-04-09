import type { AuthenticatedContext } from '@/ts/Types'

import { count } from 'drizzle-orm'
import { db } from '@/db'
import {
    users,
    claws,
    pendingClaws,
    sshKeys,
    volumes,
    referrals,
    waitlist,
    clawExports,
    emails
} from '@/db/schema'
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'
import orders from '@/lib/polar/orders'
import type { PgTable } from 'drizzle-orm/pg-core'
import withErrorHandler from '@/lib/withErrorHandler'

const safeCount = async (table: PgTable): Promise<number> => {
    try {
        const result = await db.select({ count: count() }).from(table)
        return result[0]?.count || 0
    } catch {
        return 0
    }
}

const getAdminStats = withErrorHandler(
    'getAdminStats',
    'api.failedToGetAdminStats'
)(async (c: AuthenticatedContext) => {
    const [
        userCount,
        clawCount,
        pendingClawCount,
        sshKeyCount,
        volumeCount,
        referralCount,
        waitlistCount,
        exportCount,
        emailCount,
        billingData
    ] = await Promise.all([
        safeCount(users),
        safeCount(claws),
        safeCount(pendingClaws),
        safeCount(sshKeys),
        safeCount(volumes),
        safeCount(referrals),
        safeCount(waitlist),
        safeCount(clawExports),
        safeCount(emails),
        orders.listAll(1, 1).catch(() => ({ totalCount: 0 }))
    ])

    return ok(
        c,
        {
            users: userCount,
            claws: clawCount,
            pendingClaws: pendingClawCount,
            sshKeys: sshKeyCount,
            volumes: volumeCount,
            referrals: referralCount,
            waitlist: waitlistCount,
            exports: exportCount,
            emails: emailCount,
            billing: billingData.totalCount
        },
        t('api.adminStatsFetched')
    )
})

export default getAdminStats