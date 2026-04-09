import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { getProvider } from '@/services/provider'
import { sanitizeClaw, withClaw } from '@/controllers/claws/helpers'
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const getClaw = withErrorHandler('getClaw')(
    withClaw()(async (c, claw) => {
        const id = c.req.param('id')!
        const sync = c.req.query('sync') === 'true'

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
            } catch (error) {
                console.error('getClaw', error)
            }
        }

        return ok(c, sanitizeClaw(claw), t('api.clawFetched'))
    })
)

export default getClaw