import type { AuthenticatedContext } from '@/ts/Types'

import orders from '@/lib/polar/orders'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const getAdminBilling = async (c: AuthenticatedContext) => {
    try {
        const page = parseInt(c.req.query('page') || '1')
        const limit = parseInt(c.req.query('limit') || '20')

        const result = await orders.listAll(page, limit)

        return ok(c, result, t('api.adminBillingFetched'))
    } catch (error) {
        console.error('getAdminBilling', error)
        return fail(c, t('api.failedToGetAdminBilling'), 500)
    }
}

export default getAdminBilling