import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { findUserClaw, parseEnvFile } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getClawEnvVars = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.failedToReadFile'), 400)
        }

        try {
            const envRaw = await executeSSH(
                claw.ip,
                claw.rootPassword,
                "cat /home/openclaw/.openclaw/.env 2>/dev/null || echo ''",
                10000
            )

            const envVars = parseEnvFile(envRaw)

            return ok(c, { envVars }, t('api.fileFetched'))
        } catch {
            return fail(c, t('api.failedToReadFile'), 500)
        }
    } catch (err) {
        console.error('Get claw env vars error:', err)
        return fail(
            c,
            err instanceof Error ? err.message : t('api.failedToReadFile'),
            500
        )
    }
}

export default getClawEnvVars