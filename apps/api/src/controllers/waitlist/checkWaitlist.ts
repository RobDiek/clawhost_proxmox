import type { Context } from 'hono'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { waitlist } from '@/db/schema'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const checkWaitlist = withErrorHandler(
    'checkWaitlist',
    'api.waitlistCheckFailed'
)(async (c: Context) => {
    const email = c.req.query('email')

    if (!email) return fail(c, t('api.emailRequired'), 400)

    const entry = await db
        .select({ id: waitlist.id })
        .from(waitlist)
        .where(eq(waitlist.email, email.toLowerCase().trim()))
        .then((rows) => rows[0])

    return ok(c, { joined: !!entry }, t('api.waitlistStatusFetched'))
})

export default checkWaitlist