import type { AuthenticatedContext } from '@/ts/Types'

import { findUserAgent, fetchAgentVersion } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getAgentVersion = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const agent = await findUserAgent(userId, id, c.get('isAdmin'))

        if (!agent) return fail(c, t('api.clawNotFound'), 404)

        if (!agent.ip || !agent.rootPassword)
            return fail(c, t('api.failedToGetVersion'), 400)

        const version = await fetchAgentVersion(
            agent.ip,
            agent.rootPassword,
            agent.agentType
        )

        return ok(c, { version })
    } catch (error) {
        console.error('getAgentVersion', error)
        return fail(c, t('api.failedToGetVersion'), 500)
    }
}

export default getAgentVersion