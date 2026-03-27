import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { getProvider } from '@/services/provider'
import {
    checkSubdomainReady,
    findUserClaw,
    sanitizeClaw
} from '@/controllers/claws/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const syncClaw = async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const claw = await findUserClaw(userId, id)

    if (!claw || !claw.providerServerId) {
        return fail(c, t('api.clawNotFound'), 404)
    }

    try {
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
    } catch (err) {
        console.error('Failed to sync server status:', err)
        return fail(c, t('api.failedToSyncClaw'), 500)
    }
}

export default syncClaw