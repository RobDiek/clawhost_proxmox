import type { UpdateClawEnvVarsBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import {
    BASE_DIR,
    findUserClaw,
    validateEnvVars
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const updateClawEnvVars = withErrorHandler(
    'updateClawEnvVars',
    'api.failedToUpdateFile'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<UpdateClawEnvVarsBody>()

    if (!body.envVars || typeof body.envVars !== 'object')
        return fail(c, t('api.missingRequiredFields'), 400)

    if (!validateEnvVars(body.envVars)) {
        return fail(c, t('api.invalidEnvVars'), 400)
    }

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.failedToUpdateFile'), 400)

    try {
        const existingEnv = await executeSSH(
            claw.ip,
            claw.rootPassword,
            `cat ${BASE_DIR}/.env 2>/dev/null || echo ''`,
            5000
        )

        const commentLines: string[] = []

        existingEnv
            .trim()
            .split('\n')
            .forEach((line) => {
                const trimmed = line.trim()
                if (!trimmed) return
                if (trimmed.startsWith('#')) {
                    commentLines.push(line)
                }
            })

        const newLines = [...commentLines]

        Object.entries(body.envVars).forEach(([key, value]) => {
            if (value !== '') {
                newLines.push(`${key}=${value}`)
            }
        })

        const envContent = newLines.join('\n')

        const envB64 = Buffer.from(envContent).toString('base64')

        await executeSSH(
            claw.ip,
            claw.rootPassword,
            `echo '${envB64}' | base64 -d > ${BASE_DIR}/.env && (su - openclaw -c "openclaw doctor --fix" || true) && systemctl restart openclaw-gateway`,
            20000
        )

        return ok(c, null, t('api.fileSaveSuccess'))
    } catch {
        return fail(c, t('api.failedToUpdateFile'), 500)
    }
})

export default updateClawEnvVars