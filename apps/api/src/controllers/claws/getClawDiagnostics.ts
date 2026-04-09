import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { findUserClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const SEPARATOR = '---CLAWHOST_SEP---'

const getClawDiagnostics = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)

        if (!claw.ip || !claw.rootPassword)
            return fail(c, t('api.failedToGetDiagnostics'), 400)

        const command = [
            'systemctl status openclaw-gateway 2>&1',
            `echo '${SEPARATOR}'`,
            'ss -tlnp | grep 18789 2>&1 || echo "Port 18789 not listening"',
            `echo '${SEPARATOR}'`,
            'free -h 2>&1'
        ].join('; ')

        const output = await executeSSH(claw.ip, claw.rootPassword, command)
        const parts = output.split(SEPARATOR)

        return ok(
            c,
            {
                service: parts[0]?.trim() || '',
                port: parts[1]?.trim() || '',
                memory: parts[2]?.trim() || ''
            },
            t('api.diagnosticsFetched')
        )
    } catch (error) {
        console.error('getClawDiagnostics', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToGetDiagnostics'),
            500
        )
    }
}

export default getClawDiagnostics