import { eq } from 'drizzle-orm'
import { agentStatus } from '@openclaw/shared'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { getProvider } from '@/services/provider'
import {
    checkSubdomainReady,
    sanitizeAgent,
    withAgent
} from '@/controllers/agents/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const syncAgent = withErrorHandler(
    'syncAgent',
    'api.failedToSyncClaw'
)(
    withAgent()(async (c, agent) => {
        const id = c.req.param('id')!

        if (!agent.providerServerId) return fail(c, t('api.clawNotFound'), 404)

        const provider = getProvider()
        const serverStatus = await provider.getServer(agent.providerServerId)

        if (agent.status === agentStatus.configuring) {
            if (
                serverStatus.status === agentStatus.running &&
                agent.subdomain
            ) {
                const ready = await checkSubdomainReady(agent.subdomain)
                if (ready) {
                    await db
                        .update(agents)
                        .set({
                            status: agentStatus.running,
                            ip: serverStatus.ip
                        })
                        .where(eq(agents.id, id))

                    return ok(
                        c,
                        sanitizeAgent({
                            ...agent,
                            status: agentStatus.running,
                            ip: serverStatus.ip
                        }),
                        t('api.clawSynced')
                    )
                }
            }

            await db
                .update(agents)
                .set({ ip: serverStatus.ip })
                .where(eq(agents.id, id))

            return ok(
                c,
                sanitizeAgent({
                    ...agent,
                    ip: serverStatus.ip
                }),
                t('api.clawSynced')
            )
        }

        await db
            .update(agents)
            .set({ status: serverStatus.status, ip: serverStatus.ip })
            .where(eq(agents.id, id))

        return ok(
            c,
            sanitizeAgent({
                ...agent,
                status: serverStatus.status,
                ip: serverStatus.ip
            }),
            t('api.clawSynced')
        )
    })
)

export default syncAgent