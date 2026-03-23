import type { GetAgentConfigBody, RawClawConfigAgent } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { findUserClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const ENV_SEPARATOR = '---ENV_SEPARATOR---'

const getClawAgentConfig = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const body = await c.req.json<GetAgentConfigBody>()

        if (!body.agentId || typeof body.agentId !== 'string') {
            return fail(c, t('api.missingRequiredFields'), 400)
        }

        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.agentsFetchFailed'), 400)
        }

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

            const envVars: Record<string, string> = {}
            if (envRaw) {
                envRaw.split('\n').forEach((line) => {
                    const trimmed = line.trim()
                    if (!trimmed || trimmed.startsWith('#')) return
                    const eqIndex = trimmed.indexOf('=')
                    if (eqIndex === -1) return
                    const key = trimmed.substring(0, eqIndex).trim()
                    let value = trimmed.substring(eqIndex + 1).trim()
                    if (
                        (value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))
                    ) {
                        value = value.slice(1, -1)
                    }
                    envVars[key] = value
                })
            }

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
    } catch (err) {
        console.error('Get agent config error:', err)
        return fail(
            c,
            err instanceof Error ? err.message : t('api.agentsFetchFailed'),
            500
        )
    }
}

export default getClawAgentConfig