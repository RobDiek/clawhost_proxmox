import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { db } from '@/db'
import { clawExports } from '@/db/schema'
import sshBuffer from '@/services/sshBuffer'
import { findUserClaw } from '@/controllers/claws/helpers'
import { checkRateLimit, setRateLimit } from '@/controllers/auth/rateLimit'
import { t } from '@openclaw/i18n'
import { fail } from '@/lib/response'

const EXPORT_RATE_LIMIT_WINDOW = 3_600_000

const exportClaw = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)

        if (!claw.ip || !claw.rootPassword)
            return fail(c, t('api.clawNotReady'), 400)

        const retryAfter = await checkRateLimit(
            `export:${id}`,
            EXPORT_RATE_LIMIT_WINDOW
        )

        if (retryAfter > 3)
            return fail(c, t('api.exportRateLimited'), 429, { retryAfter })

        const buffer = await sshBuffer(
            claw.ip,
            claw.rootPassword,
            'tar czf - -C /home/openclaw .openclaw'
        )

        await Promise.all([
            db.insert(clawExports).values({
                id: crypto.randomUUID(),
                userId,
                clawId: id,
                fileSize: buffer.length
            }),
            setRateLimit(`export:${id}`)
        ])

        const filename = `${claw.name}-export.tar.gz`

        return new Response(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/gzip',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        })
    } catch (error) {
        console.error('exportClaw', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToExportClaw'),
            500
        )
    }
}

export default exportClaw