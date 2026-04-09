import { eq } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { getProvider } from '@/services/provider'
import {
    checkSubdomainReady,
    sanitizeClaw,
    withClaw
} from '@/controllers/claws/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const syncClaw = withErrorHandler(
    'syncClaw',
    'api.failedToSyncClaw'
)(
    withClaw()(async (c, claw) => {
        const id = c.req.param('id')!

        if (!claw.providerServerId) return fail(c, t('api.clawNotFound'), 404)

        const provider = getProvider()
        const serverStatus = await provider.getServer(claw.providerServerId)

        if (claw.status === clawStatus.configuring) {
            if (serverStatus.status === clawStatus.running && claw.subdomain) {
                const ready = await checkSubdomainReady(claw.subdomain)
                if (ready) {
                    await db
                        .update(claws)
                        .set({
                            status: clawStatus.running,
                            ip: serverStatus.ip
                        })
                        .where(eq(claws.id, id))

                    return ok(
                        c,
                        sanitizeClaw({
                            ...claw,
                            status: clawStatus.running,
                            ip: serverStatus.ip
                        }),
                        t('api.clawSynced')
                    )
                }
            }

            await db
                .update(claws)
                .set({ ip: serverStatus.ip })
                .where(eq(claws.id, id))

            return ok(
                c,
                sanitizeClaw({
                    ...claw,
                    ip: serverStatus.ip
                }),
                t('api.clawSynced')
            )
        }

        await db
            .update(claws)
            .set({ status: serverStatus.status, ip: serverStatus.ip })
            .where(eq(claws.id, id))

        return ok(
            c,
            sanitizeClaw({
                ...claw,
                status: serverStatus.status,
                ip: serverStatus.ip
            }),
            t('api.clawSynced')
        )
    })
)

export default syncClaw