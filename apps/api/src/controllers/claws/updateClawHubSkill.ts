import type { ClawHubUpdateBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import {
    findUserClaw,
    executeClawHubOperation
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const SLUG_REGEX = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?$/

const updateClawHubSkill = withErrorHandler(
    'updateClawHubSkill',
    'api.clawHubUpdateFailed'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<ClawHubUpdateBody>()

    if (!body.slug && !body.all)
        return fail(c, t('api.missingRequiredFields'), 400)

    if (body.slug && !SLUG_REGEX.test(body.slug)) {
        return fail(c, t('api.invalidSkillName'), 400)
    }

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.clawHubUpdateFailed'), 400)

    try {
        const clawHubCmd = body.all
            ? 'clawhub update --all'
            : `clawhub update ${body.slug}`

        const { supported, version } = await executeClawHubOperation(
            claw.ip,
            claw.rootPassword,
            clawHubCmd,
            body.agentId,
            50000
        )

        if (!supported) {
            return fail(
                c,
                t('api.featureVersionUnsupported', { version }),
                400,
                { version }
            )
        }

        return ok(c, null, t('api.clawHubUpdated'))
    } catch {
        return fail(c, t('api.clawHubUpdateFailed'), 500)
    }
})

export default updateClawHubSkill