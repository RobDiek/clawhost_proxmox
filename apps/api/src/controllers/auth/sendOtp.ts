import type { Context } from 'hono'
import type { SendOtpBody } from '@/ts/Interfaces'

import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { inputValidation } from '@openclaw/shared'
import { getResend, FROM_EMAIL } from '@/services/resend'
import { db } from '@/db'
import { otpCodes, users } from '@/db/schema'
import OtpCodeEmail from '@/emails/OtpCodeEmail'
import { t } from '@openclaw/i18n'
import {
    getClientIp,
    checkRateLimit,
    setRateLimit
} from '@/controllers/auth/rateLimit'
import { ok, fail } from '@/lib/response'

const OTP_EXPIRY_MS = 10 * 60 * 1000
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const hashCode = (code: string): string => {
    return crypto.createHash('sha256').update(code).digest('hex')
}

const sendOtp = async (c: Context) => {
    try {
        const ip = getClientIp(c)

        if (ip) {
            const ipRetry = await checkRateLimit(`ip:${ip}`)
            if (ipRetry > 0) {
                return fail(c, t('api.rateLimitExceeded'), 429, {
                    retryAfter: ipRetry
                })
            }
        }

        const { email } = await c.req.json<SendOtpBody>()

        if (!email) return fail(c, t('api.emailRequired'), 400)

        if (
            !EMAIL_REGEX.test(email) ||
            email.length > inputValidation.EMAIL.MAX
        ) {
            return fail(c, t('api.invalidEmailFormat'), 400)
        }

        if (email.includes('+')) {
            const existingUser = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.email, email.toLowerCase()))
                .then((rows) => rows[0])

            if (!existingUser)
                return fail(c, t('api.plusAddressingNotAllowed'), 400)
        }

        const emailRetry = await checkRateLimit(`email:${email.toLowerCase()}`)
        if (emailRetry > 0) {
            return fail(c, t('api.rateLimitExceeded'), 429, {
                retryAfter: emailRetry
            })
        }

        const code = String(crypto.randomInt(100000, 999999))
        const codeHash = hashCode(code)

        await db.delete(otpCodes).where(eq(otpCodes.email, email.toLowerCase()))

        await db.insert(otpCodes).values({
            id: crypto.randomUUID(),
            email: email.toLowerCase(),
            codeHash,
            expiresAt: new Date(Date.now() + OTP_EXPIRY_MS)
        })

        const { error } = await getResend().emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: t('emails.otpSubject'),
            react: OtpCodeEmail({ code })
        })

        if (error) {
            console.error('sendOtp', error)
            return fail(c, t('api.failedToSendEmail'), 500)
        }

        const keys = [`email:${email.toLowerCase()}`]
        if (ip) keys.push(`ip:${ip}`)
        await setRateLimit(...keys)
        return ok(c, null, t('api.otpSent'))
    } catch {
        return fail(c, t('api.failedToSendEmail'), 500)
    }
}

export default sendOtp