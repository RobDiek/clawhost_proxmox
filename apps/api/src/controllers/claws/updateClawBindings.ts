import type { UpdateClawBindingsBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { versionGatedFeature } from '@openclaw/shared'
import {
    findUserClaw,
    SUPPORTED_CHANNELS,
    withFeatureGatedConfigUpdate
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const updateClawBindings = withErrorHandler(
    'updateClawBindings',
    'api.bindingsUpdateFailed'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<UpdateClawBindingsBody>()

    if (!Array.isArray(body.bindings)) {
        return fail(c, t('api.missingRequiredFields'), 400)
    }

    for (const binding of body.bindings) {
        if (!binding.agentId || !binding.match?.channel)
            return fail(c, t('api.bindingsInvalidFormat'), 400)
        if (!SUPPORTED_CHANNELS.has(binding.match.channel)) {
            return fail(c, t('api.bindingsInvalidChannel'), 400)
        }
    }

    const channelSet = body.bindings.map((b) => b.match.channel)
    if (new Set(channelSet).size !== channelSet.length) {
        return fail(c, t('api.bindingsDuplicateChannel'), 400)
    }

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.bindingsUpdateFailed'), 400)

    try {
        const result = await withFeatureGatedConfigUpdate({
            ip: claw.ip,
            rootPassword: claw.rootPassword,
            feature: versionGatedFeature.bindings,
            mutate: (config) => {
                config.bindings = body.bindings
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

        return ok(c, null, t('api.bindingsUpdated'))
    } catch {
        return fail(c, t('api.bindingsUpdateFailed'), 500)
    }
})

export default updateClawBindings