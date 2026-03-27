import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { getProvider, updateCachedServerStatus } from '@/services/provider'
import { findUserClaw, sanitizeClaw } from '@/controllers/claws/helpers'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const restartClaw = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id)

        if (!claw || !claw.providerServerId) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        const previousStatus = claw.status
        await db
            .update(claws)
            .set({ status: clawStatus.restarting })
            .where(eq(claws.id, id))

        try {
            await getProvider().restartServer(
                claw.providerServerId
            )
            updateCachedServerStatus(
                claw.providerServerId,
                clawStatus.restarting
            )
        } catch {
            await db
                .update(claws)
                .set({ status: previousStatus })
                .where(eq(claws.id, id))
            return fail(c, t('api.failedToRestartClaw'), 500)
        }

        return ok(
            c,
            sanitizeClaw({ ...claw, status: clawStatus.restarting }),
            t('api.clawRestarted')
        )
    } catch {
        return fail(c, t('api.failedToRestartClaw'), 500)
    }
}

export default restartClaw