import { withClaw } from '@/controllers/claws/helpers'
import { ok } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const getClawCredentials = withErrorHandler(
    'getClawCredentials',
    'api.clawNotFound'
)(
    withClaw()(async (c, claw) => {
        return ok(c, {
            rootPassword: claw.rootPassword,
            ip: claw.ip
        })
    })
)

export default getClawCredentials