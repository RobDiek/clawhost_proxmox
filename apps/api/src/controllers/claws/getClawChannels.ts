import type { ChannelConfig } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import {
    BASE_DIR,
    findUserClaw
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getClawChannels = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id)

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

            let channels: Record<string, ChannelConfig> = {}

            try {
                const trimmed = output.trim()
                const jsonStart = trimmed.indexOf('{')
                const jsonEnd = trimmed.lastIndexOf('}')
                const jsonStr =
                    jsonStart >= 0 && jsonEnd > jsonStart
                        ? trimmed.substring(jsonStart, jsonEnd + 1)
                        : '{}'
                const config = JSON.parse(jsonStr)
                channels = config?.channels || {}
            } catch {
                channels = {}
            }

            return ok(c, { channels }, t('api.channelsFetched'))
        } catch {
            return fail(c, t('api.channelsFetchFailed'), 500)
        }
    } catch {
        return fail(c, t('api.channelsFetchFailed'), 500)
    }
}

export default getClawChannels