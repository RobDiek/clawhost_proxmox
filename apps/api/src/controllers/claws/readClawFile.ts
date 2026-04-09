import type { ReadClawFileBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import path from 'path'
import executeSSH from '@/services/ssh'
import { BASE_DIR, findUserClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const readClawFile = withErrorHandler(
    'readClawFile',
    'api.failedToReadFile'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<ReadClawFileBody>()

    if (!body.path || typeof body.path !== 'string')
        return fail(c, t('api.missingRequiredFields'), 400)

    const normalized = path.posix.normalize(body.path)
    if (
        normalized.includes('..') ||
        normalized.startsWith('/') ||
        normalized.includes('\0')
    ) {
        return fail(c, t('api.invalidFilePath'), 400)
    }

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.failedToReadFile'), 400)

    const fullPath = `${BASE_DIR}/${normalized}`
    const content = await executeSSH(
        claw.ip,
        claw.rootPassword,
        `cat '${fullPath.replace(/'/g, "'\\''")}' 2>&1`
    )

    return ok(c, { content, path: normalized }, t('api.fileFetched'))
})

export default readClawFile