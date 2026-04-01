import type { UpdateClawBindingsBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import {
    applyToolsDefaults,
    BASE_DIR,
    findUserClaw,
    checkFeatureVersion,
    parseJsonFromSSH,
    writeConfigAndRestart
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const SUPPORTED_CHANNELS = new Set([
    'whatsapp',
    'telegram',
    'discord',
    'slack',
    'signal'
])

const updateClawBindings = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const body = await c.req.json<UpdateClawBindingsBody>()

        if (!Array.isArray(body.bindings)) {
            return fail(c, t('api.missingRequiredFields'), 400)
        }

        for (const binding of body.bindings) {
            if (!binding.agentId || !binding.match?.channel) {
                return fail(c, t('api.bindingsInvalidFormat'), 400)
            }
            if (!SUPPORTED_CHANNELS.has(binding.match.channel)) {
                return fail(c, t('api.bindingsInvalidChannel'), 400)
            }
        }

        const channelSet = body.bindings.map((b) => b.match.channel)
        if (new Set(channelSet).size !== channelSet.length) {
            return fail(c, t('api.bindingsDuplicateChannel'), 400)
        }

        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.bindingsUpdateFailed'), 400)
        }

        try {
            const { supported, version } = await checkFeatureVersion(
                claw.ip,
                claw.rootPassword,
                'bindings'
            )

            if (!supported) {
                return fail(
                    c,
                    t('api.featureVersionUnsupported', { version }),
                    400,
                    { version }
                )
            }

            const output = await executeSSH(
                claw.ip,
                claw.rootPassword,
                `cat ${BASE_DIR}/openclaw.json 2>/dev/null || echo '{}'`,
                5000
            )

            const config = parseJsonFromSSH(output)

            applyToolsDefaults(config)

            const agents = (config.agents || {
                defaults: {},
                list: []
            }) as Record<string, unknown>
            const defaults = (agents.defaults || {}) as Record<string, unknown>
            defaults.sandbox = { mode: 'off' }
            agents.defaults = defaults
            config.agents = agents

            config.bindings = body.bindings

            await writeConfigAndRestart(claw.ip, claw.rootPassword, config)

            return ok(c, null, t('api.bindingsUpdated'))
        } catch {
            return fail(c, t('api.bindingsUpdateFailed'), 500)
        }
    } catch {
        return fail(c, t('api.bindingsUpdateFailed'), 500)
    }
}

export default updateClawBindings