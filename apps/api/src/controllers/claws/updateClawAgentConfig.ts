import type { UpdateAgentConfigBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { versionGatedFeature } from '@openclaw/shared'
import executeSSH from '@/services/ssh'
import {
    applyToolsDefaults,
    BASE_DIR,
    findUserClaw,
    validateEnvVars,
    checkFeatureVersion,
    parseJsonFromSSH,
    mergeEnvVars,
    writeConfigAndRestart
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const ENV_SEPARATOR = '---ENV_SEPARATOR---'

const updateClawAgentConfig = withErrorHandler(
    'updateClawAgentConfig',
    'api.agentConfigUpdateFailed'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<UpdateAgentConfigBody>()

    if (!body.agentId || typeof body.agentId !== 'string')
        return fail(c, t('api.missingRequiredFields'), 400)

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.agentConfigUpdateFailed'), 400)

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

        const output = await executeSSH(
            claw.ip,
            claw.rootPassword,
            `cat ${BASE_DIR}/openclaw.json 2>/dev/null || echo '{}'; echo '${ENV_SEPARATOR}'; cat ${BASE_DIR}/.env 2>/dev/null || echo ''`,
            5000
        )

        const parts = output.split(ENV_SEPARATOR)
        const configOutput = (parts[0] || '{}').trim()
        const envRaw = (parts[1] || '').trim()

        const config = parseJsonFromSSH(configOutput)

        const commands = (config.commands || {}) as Record<string, unknown>
        commands.restart = true
        commands.bash = true
        config.commands = commands

        applyToolsDefaults(config)

        if (!config.browser) {
            config.browser = {
                enabled: true,
                executablePath: '/usr/bin/google-chrome-stable',
                headless: true,
                noSandbox: true
            }
        }

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
        const agentIndex = agentList.findIndex(
            (a) =>
                (a.id as string) === body.agentId ||
                (a.name as string) === body.agentId
        )

        if (body.name !== undefined) {
            if (!/^[a-zA-Z0-9-]+$/.test(body.name)) {
                return fail(c, t('api.agentNameInvalid'), 400)
            }

            const nameExists = agentList.some(
                (a, i) =>
                    i !== agentIndex &&
                    ((a.name as string) || '').toLowerCase() ===
                        body.name!.toLowerCase()
            )

            if (nameExists) return fail(c, t('api.agentNameDuplicate'), 400)
        }

        const validModel =
            body.model && /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/.test(body.model)
                ? body.model
                : undefined

        if (agentIndex >= 0) {
            if (body.name !== undefined) {
                agentList[agentIndex].name = body.name
            }
            if (validModel) {
                agentList[agentIndex].model = validModel
            }
        } else {
            const newAgent: Record<string, unknown> = {
                id: body.agentId,
                name: body.agentId
            }
            if (validModel) {
                newAgent.model = validModel
            }
            agentList.push(newAgent)
        }

        if (validModel) {
            const defaults = agents.defaults as Record<string, unknown>
            defaults.model = { primary: validModel }
        }

        agentList.forEach((a) => {
            delete a.status
        })

        let envContent: string | undefined

        if (body.envVars && Object.keys(body.envVars).length > 0) {
            if (!validateEnvVars(body.envVars)) {
                return fail(c, t('api.invalidEnvVars'), 400)
            }
            envContent = mergeEnvVars(envRaw, body.envVars)
        }

        await writeConfigAndRestart(
            claw.ip,
            claw.rootPassword,
            config,
            envContent
        )

        return ok(c, null, t('api.agentConfigUpdated'))
    } catch {
        return fail(c, t('api.agentConfigUpdateFailed'), 500)
    }
})

export default updateClawAgentConfig