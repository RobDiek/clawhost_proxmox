import type { ClawFileType } from '@/ts/Types'

import { clawFileType } from '@openclaw/shared'
import executeSSH from '@/services/ssh'
import { BASE_DIR, withClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const getFileType = (name: string): ClawFileType => {
    if (name.endsWith('.json') || name.endsWith('.jsonb'))
        return clawFileType.json
    if (name.endsWith('.md')) return clawFileType.markdown
    if (name.endsWith('.js')) return clawFileType.javascript
    if (name.endsWith('.ts') || name.endsWith('.tsx'))
        return clawFileType.typescript
    if (name.endsWith('.yml') || name.endsWith('.yaml'))
        return clawFileType.yaml
    if (!name.includes('.')) return clawFileType.text
    return clawFileType.unknown
}

const listClawFiles = withErrorHandler(
    'listClawFiles',
    'api.failedToListFiles'
)(
    withClaw({ requireSSH: 'api.failedToListFiles' })(async (c, claw) => {
        const output = await executeSSH(
            claw.ip!,
            claw.rootPassword!,
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
    })
)

export default listClawFiles