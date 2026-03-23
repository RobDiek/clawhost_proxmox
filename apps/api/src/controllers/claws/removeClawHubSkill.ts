import type { ClawHubRemoveBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import {
    findUserClaw,
    ensureClawHub,
    BASE_DIR
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const SLUG_REGEX = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?$/

const removeClawHubSkill = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const body = await c.req.json<ClawHubRemoveBody>()

        if (!body.slug || !SLUG_REGEX.test(body.slug)) {
            return fail(c, t('api.invalidSkillName'), 400)
        }

        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.clawHubRemoveFailed'), 400)
        }

        try {
            await ensureClawHub(claw.ip, claw.rootPassword)

            let clawHubCmd = `clawhub remove ${body.slug}`

            if (body.agentId) {
                const agentDir = `${BASE_DIR}/agents/${body.agentId}/workspace/skills`
                clawHubCmd = `${clawHubCmd} --workdir ${agentDir}`
            }

            const cmd = `su - openclaw -c "${clawHubCmd}" && (su - openclaw -c "openclaw doctor --fix" || true) && systemctl restart openclaw-gateway`

            await executeSSH(claw.ip, claw.rootPassword, cmd, 35000)

            return ok(c, null, t('api.clawHubRemoved'))
        } catch {
            return fail(c, t('api.clawHubRemoveFailed'), 500)
        }
    } catch {
        return fail(c, t('api.clawHubRemoveFailed'), 500)
    }
}

export default removeClawHubSkill