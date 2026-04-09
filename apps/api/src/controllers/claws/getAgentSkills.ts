import type { GetAgentSkillsBody, AgentSkillInfo } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { BASE_DIR, findUserClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const getAgentSkills = withErrorHandler(
    'getAgentSkills',
    'api.agentSkillsFetchFailed'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<GetAgentSkillsBody>()

    if (!body.agentId || typeof body.agentId !== 'string')
        return fail(c, t('api.missingRequiredFields'), 400)

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.agentSkillsFetchFailed'), 400)

    try {
        const skillsDir = `${BASE_DIR}/agents/${body.agentId}/workspace/skills`
        const output = await executeSSH(
            claw.ip,
            claw.rootPassword,
            `ls -1 ${skillsDir} 2>/dev/null || echo ''`,
            5000
        )

        const skillNames = output
            .trim()
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)

        const skills: AgentSkillInfo[] = skillNames.map((name) => ({
            name
        }))

        return ok(c, { skills }, t('api.agentSkillsFetched'))
    } catch {
        return fail(c, t('api.agentSkillsFetchFailed'), 500)
    }
})

export default getAgentSkills