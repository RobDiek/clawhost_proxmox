import type { AuthenticatedContext } from '@/ts/Types'

import { findUserClaw, fetchClawVersion } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getClawVersion = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)

        if (!claw.ip || !claw.rootPassword)
            return fail(c, t('api.failedToGetVersion'), 400)

        const version = await fetchClawVersion(claw.ip, claw.rootPassword)

        return ok(c, { version })
    } catch (error) {
        console.error('getClawVersion', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToGetVersion'),
            500
        )
    }
}

export default getClawVersion