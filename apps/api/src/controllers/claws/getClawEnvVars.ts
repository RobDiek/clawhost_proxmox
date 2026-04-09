import type { AuthenticatedContext } from '@/ts/Types'

import {
    BASE_DIR,
    findUserClaw,
    parseEnvFile,
    readClawConfigFile,
    ClawMissingCredentialsError
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getClawEnvVars = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)

        const envVars = await readClawConfigFile(
            claw,
            `${BASE_DIR}/.env`,
            parseEnvFile,
            { timeout: 10000 }
        )

        return ok(c, { envVars }, t('api.fileFetched'))
    } catch (error) {
        if (error instanceof ClawMissingCredentialsError)
            return fail(c, t('api.failedToReadFile'), 400)
        console.error('getClawEnvVars', error)
        return fail(
            c,
            error instanceof Error ? error.message : t('api.failedToReadFile'),
            500
        )
    }
}

export default getClawEnvVars