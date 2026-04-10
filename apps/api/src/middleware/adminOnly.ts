import type { AuthenticatedContext } from '@/ts/Types'
import type { Next } from 'hono'

import { fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const adminOnly = async (c: AuthenticatedContext, next: Next) => {
    if (!c.get('isAdmin')) return fail(c, t('api.adminAccessDenied'), 403)

    return next()
}

export default adminOnly