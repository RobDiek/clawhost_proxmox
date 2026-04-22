import {
    sanitizeAgent,
    executeServerLifecycle,
    withAgent
} from '@/controllers/agents/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const startAgent = withErrorHandler(
    'startAgent',
    'api.failedToStartClaw'
)(
    withAgent()(async (c, agent) => {
        if (!agent.providerServerId) return fail(c, t('api.clawNotFound'), 404)

        const result = await executeServerLifecycle(agent, 'start')

        if (!result.success) return fail(c, t('api.failedToStartClaw'), 500)

        return ok(
            c,
            sanitizeAgent({ ...agent, status: result.status }),
            t('api.clawStarted')
        )
    })
)

export default startAgent