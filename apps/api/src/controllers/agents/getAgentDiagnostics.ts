import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { findUserAgent, getAgentConfig } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const SEPARATOR = '---CLAWHOST_SEP---'

const getAgentDiagnostics = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const agent = await findUserAgent(userId, id, c.get('isAdmin'))

        if (!agent) return fail(c, t('api.agentNotFound'), 404)

        if (!agent.ip || !agent.rootPassword)
            return fail(c, t('api.failedToGetDiagnostics'), 400)

        const { serviceName } = getAgentConfig(agent.agentType)

        const command = [
            `systemctl status ${serviceName} 2>&1`,
            `echo '${SEPARATOR}'`,
            'ss -tlnp | grep 18789 2>&1 || echo "Port 18789 not listening"',
            `echo '${SEPARATOR}'`,
            'free -h 2>&1'
        ].join('; ')

        const output = await executeSSH(agent.ip, agent.rootPassword, command)
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
        console.error('getAgentDiagnostics', error)
        return fail(c, t('api.failedToGetDiagnostics'), 500)
    }
}

export default getAgentDiagnostics