import type { CreateClawAgentBody } from '@/ts/Interfaces'
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

const createClawAgent = withErrorHandler(
    'createClawAgent',
    'api.agentCreateFailed'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<CreateClawAgentBody>()

    if (!body.name || typeof body.name !== 'string')
        return fail(c, t('api.missingRequiredFields'), 400)

    if (!/^[a-zA-Z0-9-]+$/.test(body.name)) {
        return fail(c, t('api.agentNameInvalid'), 400)
    }

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.agentCreateFailed'), 400)

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

        if (nameExists) return fail(c, t('api.agentNameDuplicate'), 400)

        if (agentList.length === 0) {
            const defaultModel = (agents.defaults as Record<string, unknown>)
                ?.model
            const primaryModel =
                typeof defaultModel === 'object' && defaultModel !== null
                    ? (defaultModel as Record<string, unknown>).primary
                    : defaultModel
            agentList.push({
                id: 'main',
                name: 'main',
                model: typeof primaryModel === 'string' ? primaryModel : null
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
})

export default createClawAgent