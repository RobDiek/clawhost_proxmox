import type { ClawHubUpdateBody } from '@/ts/Interfaces'
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

const updateClawHubSkill = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const body = await c.req.json<ClawHubUpdateBody>()

        if (!body.slug && !body.all) {
            return fail(c, t('api.missingRequiredFields'), 400)
        }

        if (body.slug && !SLUG_REGEX.test(body.slug)) {
            return fail(c, t('api.invalidSkillName'), 400)
        }

        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.clawHubUpdateFailed'), 400)
        }

        try {
            await ensureClawHub(claw.ip, claw.rootPassword)

            let clawHubCmd = body.all
                ? 'clawhub update --all'
                : `clawhub update ${body.slug}`

            if (body.agentId) {
                const agentDir = `${BASE_DIR}/agents/${body.agentId}/workspace/skills`
                clawHubCmd = `${clawHubCmd} --workdir ${agentDir}`
            }

            const cmd = `su - openclaw -c "${clawHubCmd}" && (su - openclaw -c "openclaw doctor --fix" || true) && systemctl restart openclaw-gateway`

            await executeSSH(claw.ip, claw.rootPassword, cmd, 50000)

            return ok(c, null, t('api.clawHubUpdated'))
        } catch {
            return fail(c, t('api.clawHubUpdateFailed'), 500)
        }
    } catch {
        return fail(c, t('api.clawHubUpdateFailed'), 500)
    }
}

export default updateClawHubSkill