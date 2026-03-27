import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { getProvider } from '@/services/provider'
import { findUserClaw, sanitizeClaw } from '@/controllers/claws/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const getClaw = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const sync = c.req.query('sync') === 'true'
        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (sync && claw.providerServerId) {
            try {
                const provider = getProvider()
                const serverStatus = await provider.getServer(
                    claw.providerServerId
                )
                if (
                    serverStatus.status !== claw.status ||
                    serverStatus.ip !== claw.ip
                ) {
                    await db
                        .update(claws)
                        .set({
                            status: serverStatus.status,
                            ip: serverStatus.ip
                        })
                        .where(eq(claws.id, id))
                    return ok(
                        c,
                        sanitizeClaw({
                            ...claw,
                            status: serverStatus.status,
                            ip: serverStatus.ip
                        }),
                        t('api.clawFetched')
                    )
                }
            } catch (err) {
                console.error('Failed to sync server status:', err)
            }
        }

        return ok(c, sanitizeClaw(claw), t('api.clawFetched'))
    } catch {
        return fail(c, t('api.internalServerError'), 500)
    }
}

export default getClaw