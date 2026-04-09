import type { ClawHubInstallBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import {
    findUserClaw,
    executeClawHubOperation
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const SLUG_REGEX = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?$/

const installClawHubSkill = withErrorHandler(
    'installClawHubSkill',
    'api.clawHubInstallFailed'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<ClawHubInstallBody>()

    if (!body.slug || !SLUG_REGEX.test(body.slug)) {
        return fail(c, t('api.invalidSkillName'), 400)
    }

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.clawHubInstallFailed'), 400)

    try {
        const { supported, version } = await executeClawHubOperation(
            claw.ip,
            claw.rootPassword,
            `clawhub install ${body.slug}`,
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

        return ok(c, null, t('api.clawHubInstalled'))
    } catch {
        return fail(c, t('api.clawHubInstallFailed'), 500)
    }
})

export default installClawHubSkill