import type { RenameClawBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { inputValidation } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { findUserClaw, sanitizeClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const renameClaw = withErrorHandler('renameClaw')(async (
    c: AuthenticatedContext
) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<RenameClawBody>()

    const name = body.name?.trim()

    if (!name || name.length > inputValidation.CLAW_NAME.MAX) {
        return fail(
            c,
            t('api.invalidClawName', {
                max: inputValidation.CLAW_NAME.MAX
            }),
            400
        )
    }

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    await db.update(claws).set({ name }).where(eq(claws.id, id))

    const updated = { ...claw, name }

    return ok(c, sanitizeClaw(updated), t('api.clawRenamed'))
})

export default renameClaw