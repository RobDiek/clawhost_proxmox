import type { GetAgentConfigBody, RawClawConfigAgent } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { findUserClaw, parseEnvFile } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const ENV_SEPARATOR = '---ENV_SEPARATOR---'

const getClawAgentConfig = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const body = await c.req.json<GetAgentConfigBody>()

        if (!body.agentId || typeof body.agentId !== 'string')
            return fail(c, t('api.missingRequiredFields'), 400)

        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)

        if (!claw.ip || !claw.rootPassword)
            return fail(c, t('api.agentsFetchFailed'), 400)

        try {
            const output = await executeSSH(
                claw.ip,
                claw.rootPassword,
                `cat /home/openclaw/.openclaw/openclaw.json 2>/dev/null || echo '{}'; echo '${ENV_SEPARATOR}'; cat /home/openclaw/.openclaw/.env 2>/dev/null || echo ''`,
                10000
            )

            const parts = output.split(ENV_SEPARATOR)
            const configRaw = (parts[0] || '{}').trim()
            const envRaw = (parts[1] || '').trim()

            let agentName: string = body.agentId
            let agentModel: string | null = null
            let defaultModel: string | null = null

            try {
                const config = JSON.parse(configRaw)
                defaultModel =
                    config?.agents?.defaults?.model?.primary ||
                    (typeof config?.agents?.defaults?.model === 'string'
                        ? config.agents.defaults.model
                        : null)

                const agentList = config?.agents?.list || []
                const agent = agentList.find(
                    (a: RawClawConfigAgent) =>
                        a.id === body.agentId || a.name === body.agentId
                )

                if (agent) {
                    agentName = agent.name || body.agentId
                    agentModel = agent.model || null
                }
            } catch {
                agentModel = null
                defaultModel = null
            }

            const envVars = envRaw ? parseEnvFile(envRaw) : {}

            return ok(
                c,
                {
                    agent: {
                        id: body.agentId,
                        name: agentName,
                        model: agentModel
                    },
                    envVars,
                    defaultModel
                },
                t('api.agentConfigFetched')
            )
        } catch {
            return fail(c, t('api.agentsFetchFailed'), 500)
        }
    } catch (error) {
        console.error('getClawAgentConfig', error)
        return fail(
            c,
            error instanceof Error ? error.message : t('api.agentsFetchFailed'),
            500
        )
    }
}

export default getClawAgentConfig