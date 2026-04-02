import type { AuthenticatedContext } from '@/ts/Types'

import { findUserClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getClawCredentials = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!

        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        return ok(c, {
            rootPassword: claw.rootPassword,
            ip: claw.ip
        })
    } catch {
        return fail(c, t('api.clawNotFound'), 500)
    }
}

export default getClawCredentials