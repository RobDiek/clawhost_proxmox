import type { DeleteClawAgentBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { versionGatedFeature } from '@openclaw/shared'
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

const deleteClawAgent = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const body = await c.req.json<DeleteClawAgentBody>()

        if (!body.agentId || typeof body.agentId !== 'string')
            return fail(c, t('api.missingRequiredFields'), 400)

        if (body.agentId === 'main')
            return fail(c, t('api.cannotDeleteMainAgent'), 400)

        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)

        if (!claw.ip || !claw.rootPassword)
            return fail(c, t('api.agentDeleteFailed'), 400)

        try {
            const { supported, version } = await checkFeatureVersion(
                claw.ip,
                claw.rootPassword,
                versionGatedFeature.agents
            )

            if (!supported) {
                return fail(
                    c,
                    t('api.featureVersionUnsupported', { version }),
                    400,
                    { version }
                )
            }

            const configOutput = await executeSSH(
                claw.ip,
                claw.rootPassword,
                `cat ${BASE_DIR}/openclaw.json 2>/dev/null || echo '{}'`,
                5000
            )

            const config = parseJsonFromSSH(configOutput)

            const commands = (config.commands || {}) as Record<string, unknown>
            commands.restart = true
            commands.bash = true
            config.commands = commands

            applyToolsDefaults(config)

            if (!config.agents) return fail(c, t('api.agentDeleteFailed'), 404)

            const agents = config.agents as Record<string, unknown>
            const defaults = (agents.defaults || {}) as Record<string, unknown>
            defaults.sandbox = { mode: 'off' }
            agents.defaults = defaults

            const agentList = (agents.list || []) as Record<string, unknown>[]

            const agentIndex = agentList.findIndex(
                (a) =>
                    (a.id as string) === body.agentId ||
                    (a.name as string) === body.agentId
            )

            if (agentIndex === -1)
                return fail(c, t('api.agentDeleteFailed'), 404)

            if (agentList.length <= 1)
                return fail(c, t('api.cannotDeleteMainAgent'), 400)

            agentList.splice(agentIndex, 1)
            agentList.forEach((a) => {
                delete a.status
            })
            agents.list = agentList

            await writeConfigAndRestart(claw.ip, claw.rootPassword, config)

            return ok(c, null, t('api.agentDeleted'))
        } catch {
            return fail(c, t('api.agentDeleteFailed'), 500)
        }
    } catch (error) {
        console.error('deleteClawAgent', error)
        return fail(
            c,
            error instanceof Error ? error.message : t('api.agentDeleteFailed'),
            500
        )
    }
}

export default deleteClawAgent