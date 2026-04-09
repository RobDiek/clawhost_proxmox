import {
    sanitizeClaw,
    executeServerLifecycle,
    withClaw
} from '@/controllers/claws/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const stopClaw = withErrorHandler(
    'stopClaw',
    'api.failedToStopClaw'
)(
    withClaw()(async (c, claw) => {
        if (!claw.providerServerId) return fail(c, t('api.clawNotFound'), 404)

        const result = await executeServerLifecycle(claw, 'stop')

        if (!result.success) return fail(c, t('api.failedToStopClaw'), 500)

        return ok(
            c,
            sanitizeClaw({ ...claw, status: result.status }),
            t('api.clawStopped')
        )
    })
)

export default stopClaw