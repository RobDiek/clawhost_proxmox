import type { ChannelConfig } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import {
    BASE_DIR,
    findUserClaw,
    parseJsonFromSSH
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getClawChannels = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.channelsFetchFailed'), 400)
        }

        try {
            const output = await executeSSH(
                claw.ip,
                claw.rootPassword,
                `cat ${BASE_DIR}/openclaw.json 2>/dev/null || echo '{}'`,
                5000
            )

            const config = parseJsonFromSSH(output)
            const channels = (config?.channels || {}) as Record<
                string,
                ChannelConfig
            >

            return ok(c, { channels }, t('api.channelsFetched'))
        } catch {
            return fail(c, t('api.channelsFetchFailed'), 500)
        }
    } catch {
        return fail(c, t('api.channelsFetchFailed'), 500)
    }
}

export default getClawChannels