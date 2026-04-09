import type { UpdateClawSkillsBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { versionGatedFeature } from '@openclaw/shared'
import {
    findUserClaw,
    withFeatureGatedConfigUpdate
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const updateClawSkills = withErrorHandler(
    'updateClawSkills',
    'api.skillsUpdateFailed'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<UpdateClawSkillsBody>()

    if (!body.entries || typeof body.entries !== 'object')
        return fail(c, t('api.missingRequiredFields'), 400)

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.skillsUpdateFailed'), 400)

    try {
        const result = await withFeatureGatedConfigUpdate({
            ip: claw.ip,
            rootPassword: claw.rootPassword,
            feature: versionGatedFeature.skills,
            mutate: (config) => {
                if (!config.skills) {
                    config.skills = { entries: {} }
                }
                const skills = config.skills as Record<string, unknown>
                skills.entries = body.entries
            }
        })

        if (!result.ok) {
            return fail(
                c,
                t('api.featureVersionUnsupported', {
                    version: result.unsupportedVersion!
                }),
                400,
                { version: result.unsupportedVersion }
            )
        }

        return ok(c, null, t('api.skillsUpdated'))
    } catch {
        return fail(c, t('api.skillsUpdateFailed'), 500)
    }
})

export default updateClawSkills