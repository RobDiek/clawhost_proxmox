import { withAgent } from '@/controllers/agents/helpers'
import { ok } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const getAgentCredentials = withErrorHandler(
    'getAgentCredentials',
    'api.clawNotFound'
)(
    withAgent()(async (c, agent) => {
        return ok(c, {
            rootPassword: agent.rootPassword,
            gatewayToken: agent.gatewayToken,
            ip: agent.ip
        })
    })
)

export default getAgentCredentials