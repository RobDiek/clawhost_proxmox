/**
 * CrewAI Controller — Multi-agent crew management endpoints.
 */

import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { deployCrew, runCrew, listCrews } from '@/services/crewai'
import type { CrewConfig } from '@/services/crewai'

// POST /hosting/instances/:id/crews/deploy
// Body: CrewConfig
export const deployCrewEndpoint = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)
        if (!instance.ip) return fail(c, 'Instance not ready', 400)

        const config: CrewConfig = await c.req.json()

        if (!config.name || !config.agents?.length || !config.tasks?.length) {
            return fail(c, 'name, agents, and tasks are required', 400)
        }

        // Enforce token budget limits
        if (!config.tokenBudget) config.tokenBudget = 50_000 // default: 50k tokens
        if (config.tokenBudget > 500_000) config.tokenBudget = 500_000 // hard cap: 500k
        if (!config.timeoutSeconds) config.timeoutSeconds = 300 // default: 5 min
        if (config.timeoutSeconds > 600) config.timeoutSeconds = 600 // hard cap: 10 min

        await deployCrew(instance.ip, config, instance.rootPassword || undefined)

        return ok(c, { name: config.name, agents: config.agents.length, tasks: config.tasks.length, tokenBudget: config.tokenBudget },
            `Crew "${config.name}" deployed with ${config.agents.length} agents`)
    } catch (err) {
        console.error('deployCrew error:', err)
        return fail(c, 'Failed to deploy crew', 500)
    }
}

// POST /hosting/instances/:id/crews/:crewName/run
export const runCrewEndpoint = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)
        if (!instance.ip) return fail(c, 'Instance not ready', 400)

        const crewName = c.req.param('crewName')
        if (!crewName || !/^[a-zA-Z0-9_-]+$/.test(crewName)) {
            return fail(c, 'Invalid crew name', 400)
        }

        const result = await runCrew(instance.ip, crewName, instance.rootPassword || undefined)

        if (!result.success) {
            return fail(c, result.error || 'Crew execution failed', 500)
        }

        return ok(c, result, `Crew "${crewName}" completed in ${result.elapsedSeconds}s`)
    } catch (err) {
        console.error('runCrew error:', err)
        return fail(c, 'Failed to run crew', 500)
    }
}

// GET /hosting/instances/:id/crews
export const listCrewsEndpoint = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)
        if (!instance.ip) return fail(c, 'Instance not ready', 400)

        const crews = await listCrews(instance.ip, instance.rootPassword || undefined)
        return ok(c, crews, `${crews.length} crews deployed`)
    } catch (err) {
        console.error('listCrews error:', err)
        return fail(c, 'Failed to list crews', 500)
    }
}