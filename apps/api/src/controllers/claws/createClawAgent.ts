import type { CreateClawAgentBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import {
    applyToolsDefaults,
    BASE_DIR,
    findUserClaw,
    validateEnvVars
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const ENV_SEPARATOR = '---ENV_SEPARATOR---'

const createClawAgent = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const body = await c.req.json<CreateClawAgentBody>()

        if (!body.name || typeof body.name !== 'string') {
            return fail(c, t('api.missingRequiredFields'), 400)
        }

        if (!/^[a-zA-Z0-9-]+$/.test(body.name)) {
            return fail(c, t('api.agentNameInvalid'), 400)
        }

        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.agentCreateFailed'), 400)
        }

        try {
            const output = await executeSSH(
                claw.ip,
                claw.rootPassword,
                `cat ${BASE_DIR}/openclaw.json 2>/dev/null || echo '{}'; echo '${ENV_SEPARATOR}'; cat ${BASE_DIR}/.env 2>/dev/null || echo ''`,
                5000
            )

            const parts = output.split(ENV_SEPARATOR)
            const configOutput = (parts[0] || '{}').trim()
            const envRaw = (parts[1] || '').trim()

            let config: Record<string, unknown> = {}
            try {
                config = JSON.parse(configOutput)
            } catch {
                config = {}
            }

            const commands = (config.commands || {}) as Record<string, unknown>
            commands.restart = true
            commands.bash = true
            config.commands = commands

            applyToolsDefaults(config)

            if (!config.agents) {
                config.agents = { defaults: {}, list: [] }
            }

            const agents = config.agents as Record<string, unknown>
            const defaults = (agents.defaults || {}) as Record<string, unknown>
            defaults.sandbox = { mode: 'off' }
            agents.defaults = defaults

            if (!agents.list) {
                agents.list = []
            }

            const agentList = agents.list as Record<string, unknown>[]

            const nameExists = agentList.some(
                (a) =>
                    ((a.name as string) || '').toLowerCase() ===
                    body.name.toLowerCase()
            )

            if (nameExists) {
                return fail(c, t('api.agentNameDuplicate'), 400)
            }

            if (agentList.length === 0) {
                const defaultModel = (
                    agents.defaults as Record<string, unknown>
                )?.model
                const primaryModel =
                    typeof defaultModel === 'object' && defaultModel !== null
                        ? (defaultModel as Record<string, unknown>).primary
                        : defaultModel
                agentList.push({
                    id: 'main',
                    name: 'main',
                    model:
                        typeof primaryModel === 'string' ? primaryModel : null
                })
            }

            const agentId = `${body.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')}-${Date.now()}`

            const newAgent: Record<string, unknown> = {
                id: agentId,
                name: body.name
            }

            if (body.model) {
                newAgent.model = body.model
            }

            agentList.push(newAgent)

            const configJson = JSON.stringify(config, null, 4)
            const configB64 = Buffer.from(configJson).toString('base64')
            let writeCommand = `echo '${configB64}' | base64 -d > ${BASE_DIR}/openclaw.json`

            if (body.envVars && Object.keys(body.envVars).length > 0) {
                if (!validateEnvVars(body.envVars)) {
                    return fail(c, t('api.invalidEnvVars'), 400)
                }

                const existingLines: string[] = []
                const existingKeys = new Set<string>()

                envRaw.split('\n').forEach((line) => {
                    const trimmed = line.trim()
                    if (!trimmed || trimmed.startsWith('#')) {
                        existingLines.push(line)
                        return
                    }
                    const eqIndex = trimmed.indexOf('=')
                    if (eqIndex === -1) {
                        existingLines.push(line)
                        return
                    }
                    const key = trimmed.substring(0, eqIndex).trim()
                    existingKeys.add(key)

                    if (key in body.envVars!) {
                        const value = body.envVars![key]
                        if (value === '') return
                        existingLines.push(`${key}=${value}`)
                    } else {
                        existingLines.push(line)
                    }
                })

                Object.entries(body.envVars).forEach(([key, value]) => {
                    if (!existingKeys.has(key) && value !== '') {
                        existingLines.push(`${key}=${value}`)
                    }
                })

                const envContent = existingLines.join('\n')
                const envB64 = Buffer.from(envContent).toString('base64')
                writeCommand += ` && echo '${envB64}' | base64 -d > ${BASE_DIR}/.env`
            }

            await executeSSH(
                claw.ip,
                claw.rootPassword,
                `${writeCommand} && (su - openclaw -c "openclaw doctor --fix" || true) && systemctl restart openclaw-gateway`,
                20000
            )

            return ok(
                c,
                {
                    agent: {
                        id: agentId,
                        name: body.name,
                        model: body.model || null,
                        status: 'running',
                        directory: null
                    }
                },
                t('api.agentCreated')
            )
        } catch {
            return fail(c, t('api.agentCreateFailed'), 500)
        }
    } catch {
        return fail(c, t('api.agentCreateFailed'), 500)
    }
}

export default createClawAgent