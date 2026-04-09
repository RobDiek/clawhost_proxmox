import {
    sanitizeClaw,
    executeServerLifecycle,
    withClaw
} from '@/controllers/claws/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const restartClaw = withErrorHandler(
    'restartClaw',
    'api.failedToRestartClaw'
)(
    withClaw()(async (c, claw) => {
        if (!claw.providerServerId) return fail(c, t('api.clawNotFound'), 404)

        const result = await executeServerLifecycle(claw, 'restart')

        if (!result.success) return fail(c, t('api.failedToRestartClaw'), 500)

        return ok(
            c,
            sanitizeClaw({ ...claw, status: result.status }),
            t('api.clawRestarted')
        )
    })
)

export default restartClaw