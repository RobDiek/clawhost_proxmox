import type { AuthenticatedContext } from '@/ts/Types'
import type { ClawBindingEntry, ClawBindingAgent } from '@/ts/Interfaces'

import executeSSH from '@/services/ssh'
import { BASE_DIR, findUserClaw, parseJsonFromSSH } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getClawBindings = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.bindingsFetchFailed'), 400)
        }

        try {
            const output = await executeSSH(
                claw.ip,
                claw.rootPassword,
                `cat ${BASE_DIR}/openclaw.json 2>/dev/null || echo '{}'`,
                5000
            )

            const config = parseJsonFromSSH(output)
            const bindings: ClawBindingEntry[] = Array.isArray(config?.bindings)
                ? config.bindings as ClawBindingEntry[]
                : []
            const channels = (config?.channels || {}) as Record<string, unknown>
            const agentList = Array.isArray(
                (config?.agents as Record<string, unknown>)?.list
            )
                ? (config.agents as Record<string, unknown>).list as ClawBindingAgent[]
                : []
            const agents = agentList.map((a: ClawBindingAgent) => ({
                id: a.id,
                name: a.name
            }))

            return ok(
                c,
                { bindings, channels, agents },
                t('api.bindingsFetched')
            )
        } catch {
            return fail(c, t('api.bindingsFetchFailed'), 500)
        }
    } catch {
        return fail(c, t('api.bindingsFetchFailed'), 500)
    }
}

export default getClawBindings