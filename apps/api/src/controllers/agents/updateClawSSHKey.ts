import type { UpdateClawSSHKeyBody } from '@/ts/Interfaces'

import { eq, and } from 'drizzle-orm'
import { t } from '@openclaw/i18n'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws, sshKeys } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import executeSSH from '@/services/ssh'
import { withClaw } from '@/controllers/agents/helpers'

const updateClawSSHKey = withClaw()(async (c, claw) => {
    try {
        const { sshKeyId } = await c.req.json<UpdateClawSSHKeyBody>()
        const userId = c.get('userId')

        let publicKey: string | null = null

        if (sshKeyId) {
            const key = await db
                .select()
                .from(sshKeys)
                .where(
                    and(eq(sshKeys.id, sshKeyId), eq(sshKeys.userId, userId))
                )
                .limit(1)

            if (!key[0]) return fail(c, t('api.sshKeyNotFound'), 404)
            publicKey = key[0].publicKey
        }

        if (claw.ip && claw.rootPassword && claw.status === clawStatus.running) {
            const authKeysContent = publicKey
                ? publicKey.trim()
                : ''
            await executeSSH(
                claw.ip,
                claw.rootPassword,
                `mkdir -p ~/.ssh && echo '${authKeysContent.replace(/'/g, "'\\''")}' > ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`
            )
        }

        await db
            .update(claws)
            .set({ sshKeyId: sshKeyId || null })
            .where(eq(claws.id, claw.id))

        return ok(c, { sshKeyId: sshKeyId || null }, t('api.sshKeyUpdated'))
    } catch (error) {
        console.error('updateClawSSHKey', error)
        return fail(c, t('api.failedToUpdateSSHKey'), 500)
    }
})

export default updateClawSSHKey