import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { getPolarClient } from '@/lib/polar'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const getCustomerPortal = withErrorHandler(
    'getCustomerPortal',
    'api.failedToGetCustomerPortal'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')

    const user = await db
        .select({ polarCustomerId: users.polarCustomerId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    const polarCustomerId = user[0]?.polarCustomerId
    if (!polarCustomerId) return fail(c, t('api.noBillingAccount'), 404)

    const clientUrl = process.env.CLIENT
    const http = clientUrl?.includes('localhost') ? 'http' : 'https'
    const returnUrl = `${http}://${clientUrl}/account`

    const polar = getPolarClient()
    const session = await polar.customerSessions.create({
        customerId: polarCustomerId,
        returnUrl
    })

    return ok(
        c,
        { url: session.customerPortalUrl },
        t('api.customerPortalFetched')
    )
})

export default getCustomerPortal