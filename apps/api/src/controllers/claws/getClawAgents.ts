import type { ClawAgent, RawClawConfigAgent } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import executeSSH from '@/services/ssh'
import {
    findUserClaw,
    parseJsonFromSSH,
    BASE_DIR
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const KNOWN_AGENT_STATUSES = new Set([
    'running',
    'stopped',
    'idle',
    'error',
    'crashed',
    'starting',
    'stopping'
])

const normalizeAgentStatus = (status: unknown): string => {
    const s = typeof status === 'string' ? status.toLowerCase() : ''
    if (KNOWN_AGENT_STATUSES.has(s)) return s
    return 'unknown'
}

const getClawAgents = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)

        if (!claw.ip || !claw.rootPassword) {
            await db
                .update(claws)
                .set({ status: clawStatus.unreachable })
                .where(eq(claws.id, id))
            return ok(
                c,
                { agents: [], reachable: false },
                t('api.agentsFetchFailed')
            )
        }

        try {
            const output = await executeSSH(
                claw.ip,
                claw.rootPassword,
                `cat ${BASE_DIR}/openclaw.json 2>/dev/null || echo '{}'`,
                5000
            )

            const config = parseJsonFromSSH(output)
            let agents: ClawAgent[]

            const agentList = config?.agents
                ? (config.agents as Record<string, unknown>)?.list
                : undefined
            const defaultModel = (config?.agents as Record<string, unknown>)
                ?.defaults
                ? (
                      (config.agents as Record<string, unknown>)
                          .defaults as Record<string, unknown>
                  )?.model
                : null

            const rawDefault =
                typeof defaultModel === 'object' && defaultModel !== null
                    ? (defaultModel as Record<string, unknown>).primary
                    : defaultModel
            const resolvedDefault =
                typeof rawDefault === 'string' ? rawDefault : null

            if (!Array.isArray(agentList) || agentList.length === 0) {
                agents = [
                    {
                        id: 'main',
                        name: 'main',
                        model:
                            typeof resolvedDefault === 'string'
                                ? resolvedDefault
                                : null,
                        status: 'unknown',
                        directory: null
                    }
                ]
            } else {
                agents = agentList.map(
                    (agent: RawClawConfigAgent, index: number) => ({
                        id: agent.id || `agent-${index}`,
                        name: agent.name || agent.id || `Agent ${index + 1}`,
                        model: agent.model || resolvedDefault || null,
                        status: normalizeAgentStatus(agent.status),
                        directory: agent.workspace || agent.directory || null
                    })
                )
            }

            if (claw.status === clawStatus.unreachable) {
                await db
                    .update(claws)
                    .set({ status: clawStatus.running })
                    .where(eq(claws.id, id))
            }
            return ok(c, { agents, reachable: true }, t('api.agentsFetched'))
        } catch {
            if (claw.status === clawStatus.running) {
                await db
                    .update(claws)
                    .set({ status: clawStatus.unreachable })
                    .where(eq(claws.id, id))
            }
            return ok(
                c,
                { agents: [], reachable: false },
                t('api.agentsFetchFailed')
            )
        }
    } catch (error) {
        console.error('getClawAgents', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToGetDiagnostics'),
            500
        )
    }
}

export default getClawAgents