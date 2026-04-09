import type { ChannelConfig } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import {
    BASE_DIR,
    findUserClaw,
    parseJsonFromSSH,
    readClawConfigFile,
    ClawMissingCredentialsError
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getClawChannels = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)

        const config = await readClawConfigFile(
            claw,
            `${BASE_DIR}/openclaw.json`,
            (raw) => parseJsonFromSSH(raw),
            { fallback: '{}' }
        )

        const channels = (config?.channels || {}) as Record<
            string,
            ChannelConfig
        >

        return ok(c, { channels }, t('api.channelsFetched'))
    } catch (error) {
        if (error instanceof ClawMissingCredentialsError)
            return fail(c, t('api.channelsFetchFailed'), 400)
        return fail(c, t('api.channelsFetchFailed'), 500)
    }
}

export default getClawChannels