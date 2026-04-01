import type { ClawFileType, AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import { BASE_DIR, findUserClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const getFileType = (name: string): ClawFileType => {
    if (name.endsWith('.json') || name.endsWith('.jsonb')) return 'json'
    if (name.endsWith('.md')) return 'markdown'
    if (name.endsWith('.js')) return 'javascript'
    if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'typescript'
    if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'yaml'
    if (!name.includes('.')) return 'text'
    return 'unknown'
}

const listClawFiles = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.failedToListFiles'), 400)
        }

        const output = await executeSSH(
            claw.ip,
            claw.rootPassword,
            `find -P ${BASE_DIR} -type f 2>/dev/null | sort`
        )

        const files = output
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .map((fullPath) => {
                const relativePath = fullPath.replace(`${BASE_DIR}/`, '')
                const name = relativePath.split('/').pop() || relativePath
                return {
                    path: relativePath,
                    name,
                    fileType: getFileType(name)
                }
            })

        return ok(c, { files }, t('api.filesFetched'))
    } catch {
        return fail(c, t('api.failedToListFiles'), 500)
    }
}

export default listClawFiles