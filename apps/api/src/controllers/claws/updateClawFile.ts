import type { UpdateClawFileBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import path from 'path'
import { inputValidation } from '@openclaw/shared'
import {
    BASE_DIR,
    findUserClaw,
    safeShellWrite
} from '@/controllers/claws/helpers'
import executeSSH from '@/services/ssh'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const updateClawFile = withErrorHandler(
    'updateClawFile',
    'api.failedToUpdateFile'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<UpdateClawFileBody>()

    if (
        !body.path ||
        typeof body.path !== 'string' ||
        !body.content ||
        typeof body.content !== 'string'
    )
        return fail(c, t('api.missingRequiredFields'), 400)

    if (body.content.length > inputValidation.FILE_CONTENT.MAX)
        return fail(c, t('api.fileTooLarge'), 400)

    const normalized = path.posix.normalize(body.path)
    if (
        normalized.includes('..') ||
        normalized.startsWith('/') ||
        normalized.includes('\0')
    ) {
        return fail(c, t('api.invalidFilePath'), 400)
    }

    const fileName = normalized.split('/').pop() || normalized
    const isEditable =
        normalized.endsWith('.json') ||
        normalized.endsWith('.jsonb') ||
        normalized.endsWith('.md') ||
        normalized.endsWith('.js') ||
        normalized.endsWith('.ts') ||
        normalized.endsWith('.tsx') ||
        normalized.endsWith('.yml') ||
        normalized.endsWith('.yaml') ||
        !fileName.includes('.')

    if (!isEditable) return fail(c, t('api.fileNotEditable'), 400)

    if (normalized.endsWith('.json') || normalized.endsWith('.jsonb')) {
        try {
            JSON.parse(body.content)
        } catch {
            return fail(c, t('api.invalidJsonConfig'), 400)
        }
    }

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.failedToUpdateFile'), 400)

    const fullPath = `${BASE_DIR}/${normalized}`

    await safeShellWrite(claw.ip, claw.rootPassword, fullPath, body.content)

    await executeSSH(
        claw.ip,
        claw.rootPassword,
        '(su - openclaw -c "openclaw doctor --fix" || true) && systemctl restart openclaw-gateway',
        20000
    )

    return ok(c, null, t('api.fileSaveSuccess'))
})

export default updateClawFile