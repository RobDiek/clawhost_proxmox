import type { UpdateClawSkillsBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { applyToolsDefaults, BASE_DIR, findUserClaw } from '@/controllers/claws/helpers'
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

        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.skillsUpdateFailed'), 400)
        }

        try {
            const output = await executeSSH(
                claw.ip,
                claw.rootPassword,
                `cat ${BASE_DIR}/openclaw.json 2>/dev/null || echo '{}'`,
                5000
            )

            let config: Record<string, unknown> = {}
            try {
                const trimmed = output.trim()
                const jsonStart = trimmed.indexOf('{')
                const jsonEnd = trimmed.lastIndexOf('}')
                const jsonStr =
                    jsonStart >= 0 && jsonEnd > jsonStart
                        ? trimmed.substring(jsonStart, jsonEnd + 1)
                        : '{}'
                config = JSON.parse(jsonStr)
            } catch {
                config = {}
            }

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

            const configJson = JSON.stringify(config, null, 4)
            const configB64 = Buffer.from(configJson).toString('base64')

            await executeSSH(
                claw.ip,
                claw.rootPassword,
                `echo '${configB64}' | base64 -d > ${BASE_DIR}/openclaw.json && (su - openclaw -c "openclaw doctor --fix" || true) && systemctl restart openclaw-gateway`,
                20000
            )

            return ok(c, null, t('api.skillsUpdated'))
        } catch {
            return fail(c, t('api.skillsUpdateFailed'), 500)
        }
    } catch {
        return fail(c, t('api.skillsUpdateFailed'), 500)
    }
}

export default updateClawSkills