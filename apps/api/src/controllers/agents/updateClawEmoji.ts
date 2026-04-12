import type { UpdateClawEmojiBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { findUserClaw, sanitizeClaw } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const updateClawEmoji = withErrorHandler('updateClawEmoji')(async (
    c: AuthenticatedContext
) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<UpdateClawEmojiBody>()

    const emoji = body.emoji
    const emojiColor = body.emojiColor

    if (emoji !== null && emoji.length > 2)
        return fail(c, t('api.failedToUpdateEmoji'), 400)

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    await db
        .update(claws)
        .set({ emoji, emojiColor })
        .where(eq(claws.id, id))

    const updated = { ...claw, emoji, emojiColor }

    return ok(c, sanitizeClaw(updated), t('api.clawEmojiUpdated'))
})

export default updateClawEmoji