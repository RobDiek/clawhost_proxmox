import type { ClawAgent, RawClawConfigAgent } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import executeSSH from '@/services/ssh'
import { findUserClaw } from '@/controllers/claws/helpers'
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
        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

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
                "cat /home/openclaw/.openclaw/openclaw.json 2>/dev/null || echo '{}'",
                5000
            )

            let agents: ClawAgent[] = []

            try {
                const trimmed = output.trim()
                const jsonStart = trimmed.indexOf('{')
                const jsonEnd = trimmed.lastIndexOf('}')
                const jsonStr =
                    jsonStart >= 0 && jsonEnd > jsonStart
                        ? trimmed.substring(jsonStart, jsonEnd + 1)
                        : '{}'
                const config = JSON.parse(jsonStr)
                const agentList = config?.agents?.list || []
                const defaultModel =
                    config?.agents?.defaults?.model?.primary ||
                    config?.agents?.defaults?.model ||
                    null

                if (agentList.length === 0) {
                    agents = [
                        {
                            id: 'main',
                            name: 'main',
                            model:
                                typeof defaultModel === 'string'
                                    ? defaultModel
                                    : null,
                            status: 'unknown',
                            directory: null
                        }
                    ]
                } else {
                    agents = agentList.map(
                        (agent: RawClawConfigAgent, index: number) => ({
                            id: agent.id || `agent-${index}`,
                            name:
                                agent.name || agent.id || `Agent ${index + 1}`,
                            model: agent.model || defaultModel || null,
                            status: normalizeAgentStatus(agent.status),
                            directory:
                                agent.workspace || agent.directory || null
                        })
                    )
                }
            } catch {
                agents = [
                    {
                        id: 'main',
                        name: 'main',
                        model: null,
                        status: 'unknown',
                        directory: null
                    }
                ]
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
    } catch (err) {
        console.error('Get claw agents error:', err)
        return fail(
            c,
            err instanceof Error
                ? err.message
                : t('api.failedToGetDiagnostics'),
            500
        )
    }
}

export default getClawAgents