import type { AuthenticatedContext } from '@/ts/Types'

import {
    findUserClaw,
    sanitizeClaw,
    executeServerLifecycle
} from '@/controllers/claws/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const restartClaw = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw || !claw.providerServerId) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        const result = await executeServerLifecycle(claw, 'restart')

        if (!result.success) {
            return fail(c, t('api.failedToRestartClaw'), 500)
        }

        return ok(
            c,
            sanitizeClaw({ ...claw, status: result.status }),
            t('api.clawRestarted')
        )
    } catch {
        return fail(c, t('api.failedToRestartClaw'), 500)
    }
}

export default restartClaw