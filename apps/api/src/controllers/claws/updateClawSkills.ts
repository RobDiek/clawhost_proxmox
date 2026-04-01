import type { UpdateClawSkillsBody } from '@/ts/Interfaces'
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

const updateClawSkills = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const body = await c.req.json<UpdateClawSkillsBody>()

        if (!body.entries || typeof body.entries !== 'object') {
            return fail(c, t('api.missingRequiredFields'), 400)
        }

        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.skillsUpdateFailed'), 400)
        }

        try {
            const { supported, version } = await checkFeatureVersion(
                claw.ip,
                claw.rootPassword,
                'skills'
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

            if (!config.skills) {
                config.skills = { entries: {} }
            }

            const skills = config.skills as Record<string, unknown>
            skills.entries = body.entries

            await writeConfigAndRestart(claw.ip, claw.rootPassword, config)

            return ok(c, null, t('api.skillsUpdated'))
        } catch {
            return fail(c, t('api.skillsUpdateFailed'), 500)
        }
    } catch {
        return fail(c, t('api.skillsUpdateFailed'), 500)
    }
}

export default updateClawSkills