import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { findUserAgent, getAgentConfig } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getAgentLogs = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const agent = await findUserAgent(userId, id, c.get('isAdmin'))

        if (!agent) return fail(c, t('api.agentNotFound'), 404)

        if (!agent.ip || !agent.rootPassword)
            return fail(c, t('api.failedToGetDiagnostics'), 400)

        const { logFile } = getAgentConfig(agent.agentType)

        const output = await executeSSH(
            agent.ip,
            agent.rootPassword,
            `tail -100 ${logFile} 2>&1`
        )

        return ok(c, { logs: output }, t('api.logsFetched'))
    } catch (error) {
        console.error('getAgentLogs', error)
        return fail(c, t('api.failedToGetDiagnostics'), 500)
    }
}

export default getAgentLogs