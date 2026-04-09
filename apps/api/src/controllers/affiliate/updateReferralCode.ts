import type { AuthenticatedContext } from '@/ts/Types'
import type { UpdateReferralCodeBody } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'

const REFERRAL_CODE_REGEX = /^[a-zA-Z0-9_-]+$/

const updateReferralCode = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const body = await c.req.json<UpdateReferralCodeBody>()

        if (!body.code || typeof body.code !== 'string')
            return fail(c, t('api.missingRequiredFields'), 400)

        const code = body.code.toLowerCase().trim()

        if (
            code.length < inputValidation.REFERRAL_CODE.MIN ||
            code.length > inputValidation.REFERRAL_CODE.MAX
        ) {
            return fail(
                c,
                t('api.invalidReferralCodeLength', {
                    min: String(inputValidation.REFERRAL_CODE.MIN),
                    max: String(inputValidation.REFERRAL_CODE.MAX)
                }),
                400
            )
        }

        if (!REFERRAL_CODE_REGEX.test(code)) {
            return fail(c, t('api.invalidReferralCodeFormat'), 400)
        }

        const user = await db
            .select({
                referralCodeChanged: users.referralCodeChanged
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)

        if (!user[0]) return fail(c, t('api.userNotFound'), 404)

        if (user[0].referralCodeChanged)
            return fail(c, t('api.referralCodeAlreadyChanged'), 400)

        const existing = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.referralCode, code))
            .limit(1)

        if (existing[0]) return fail(c, t('api.referralCodeTaken'), 400)

        await db
            .update(users)
            .set({
                referralCode: code,
                referralCodeChanged: true
            })
            .where(eq(users.id, userId))

        return ok(c, { referralCode: code }, t('api.referralCodeUpdated'))
    } catch (error) {
        console.error('updateReferralCode', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToUpdateReferralCode'),
            500
        )
    }
}

export default updateReferralCode