import type { RotatePasswordBody } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { encrypt } from '@/lib/encryption'
import executeSSH from '@/services/ssh'
import { withClaw, generatePassword } from '@/controllers/agents/helpers'

const rotatePassword = withClaw({ requireSSH: 'api.failedToRotatePassword' })(
    async (c, claw) => {
        try {
            const body = await c.req
                .json<RotatePasswordBody>()
                .catch(() => ({}) as RotatePasswordBody)
            const newPassword = body.password || generatePassword()

            if (
                newPassword.length < inputValidation.PASSWORD.MIN ||
                newPassword.length > inputValidation.PASSWORD.MAX
            ) return fail(c, t('api.invalidPassword', {
                min: inputValidation.PASSWORD.MIN,
                max: inputValidation.PASSWORD.MAX
            }), 400)

            const passwordBase64 = Buffer.from(newPassword).toString('base64')

            const oldEncryptedPassword = encrypt(claw.rootPassword!)

            await db
                .update(claws)
                .set({ rootPassword: encrypt(newPassword) })
                .where(eq(claws.id, claw.id))

            try {
                await executeSSH(
                    claw.ip!,
                    claw.rootPassword!,
                    `echo "root:$(echo '${passwordBase64}' | base64 -d)" | chpasswd`
                )
            } catch (sshError) {
                await db
                    .update(claws)
                    .set({ rootPassword: oldEncryptedPassword })
                    .where(eq(claws.id, claw.id))
                throw sshError
            }

            return ok(c, { rotated: true }, t('api.passwordRotated'))
        } catch (error) {
            console.error('rotatePassword', error)
            return fail(
                c,
                error instanceof Error
                    ? error.message
                    : t('api.failedToRotatePassword'),
                500
            )
        }
    }
)

export default rotatePassword