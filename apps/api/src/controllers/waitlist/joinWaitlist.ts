import type { Context } from 'hono'
import type { JoinWaitlistBody } from '@/ts/Interfaces'

import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { inputValidation } from '@openclaw/shared'
import { db } from '@/db'
import { waitlist } from '@/db/schema'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import {
    getClientIp,
    checkRateLimit,
    setRateLimit
} from '@/controllers/auth/rateLimit'
import withErrorHandler from '@/lib/withErrorHandler'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RATE_LIMIT_WINDOW = 60_000

const joinWaitlist = withErrorHandler(
    'joinWaitlist',
    'api.waitlistJoinFailed'
)(async (c: Context) => {
    const ip = getClientIp(c)

    if (ip) {
        const retryAfter = await checkRateLimit(
            `waitlist:ip:${ip}`,
            RATE_LIMIT_WINDOW
        )
        if (retryAfter > 0) {
            const unit =
                retryAfter === 1 ? t('common.second') : t('common.seconds')
            return fail(
                c,
                t('api.waitlistRateLimited', {
                    seconds: String(retryAfter),
                    unit
                }),
                429
            )
        }
    }

    const { email } = await c.req.json<JoinWaitlistBody>()

    if (!email) return fail(c, t('api.emailRequired'), 400)

    const normalizedEmail = email.toLowerCase().trim()

    if (
        !EMAIL_REGEX.test(normalizedEmail) ||
        normalizedEmail.length > inputValidation.EMAIL.MAX
    ) {
        return fail(c, t('api.invalidEmailFormat'), 400)
    }

    const existing = await db
        .select({ id: waitlist.id })
        .from(waitlist)
        .where(eq(waitlist.email, normalizedEmail))
        .then((rows) => rows[0])

    if (existing) {
        return ok(
            c,
            { joined: true, alreadyJoined: true },
            t('api.waitlistAlreadyJoined')
        )
    }

    await db.insert(waitlist).values({
        id: crypto.randomUUID(),
        email: normalizedEmail
    })

    if (ip) {
        await setRateLimit(`waitlist:ip:${ip}`)
    }

    return ok(
        c,
        { joined: true, alreadyJoined: false },
        t('api.waitlistJoined')
    )
})

export default joinWaitlist