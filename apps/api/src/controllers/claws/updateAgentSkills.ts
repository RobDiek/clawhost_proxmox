import type { UpdateAgentSkillsBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { versionGatedFeature } from '@openclaw/shared'
import executeSSH from '@/services/ssh'
import {
    BASE_DIR,
    findUserClaw,
    checkFeatureVersion
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const SKILL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/

const updateAgentSkills = withErrorHandler(
    'updateAgentSkills',
    'api.agentSkillsUpdateFailed'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<UpdateAgentSkillsBody>()

    if (!body.skillName || !body.action)
        return fail(c, t('api.missingRequiredFields'), 400)

    if (!SKILL_NAME_REGEX.test(body.skillName)) {
        return fail(c, t('api.invalidSkillName'), 400)
    }

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.agentSkillsUpdateFailed'), 400)

    try {
        const { supported, version } = await checkFeatureVersion(
            claw.ip,
            claw.rootPassword,
            versionGatedFeature.skills
        )

        if (!supported) {
            return fail(
                c,
                t('api.featureVersionUnsupported', { version }),
                400,
                { version }
            )
        }
    } catch {
        return fail(c, t('api.agentSkillsUpdateFailed'), 500)
    }

    const agentId = c.req.param('agentId')!
    if (!agentId) return fail(c, t('api.missingRequiredFields'), 400)

    const skillsDir = `${BASE_DIR}/agents/${agentId}/workspace/skills`

    try {
        if (body.action === 'install') {
            const skillDir = `${skillsDir}/${body.skillName}`
            const skillMd = `# ${body.skillName}\\n\\nCustom skill installed via ClawHost.`
            await executeSSH(
                claw.ip,
                claw.rootPassword,
                `mkdir -p ${skillDir} && echo -e '${skillMd}' > ${skillDir}/SKILL.md && chown -R openclaw:openclaw ${skillsDir} && (su - openclaw -c "openclaw doctor --fix" || true) && systemctl restart openclaw-gateway`,
                20000
            )
        } else if (body.action === 'remove') {
            const skillDir = `${skillsDir}/${body.skillName}`
            await executeSSH(
                claw.ip,
                claw.rootPassword,
                `rm -rf ${skillDir} && (su - openclaw -c "openclaw doctor --fix" || true) && systemctl restart openclaw-gateway`,
                20000
            )
        } else {
            return fail(c, t('api.missingRequiredFields'), 400)
        }

        return ok(c, null, t('api.agentSkillsUpdated'))
    } catch {
        return fail(c, t('api.agentSkillsUpdateFailed'), 500)
    }
})

export default updateAgentSkills